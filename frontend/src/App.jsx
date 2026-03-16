import { useState, useEffect, useRef, useCallback } from 'react'
import axios from 'axios'

const API_BASE = '/api'

const SOURCE_NAMES = {
  MiguMusicClient: '咪咕',
  NeteaseMusicClient: '网易云',
  QQMusicClient: 'QQ音乐',
  KuwoMusicClient: '酷我',
  KugouMusicClient: '酷狗'
}

const QUALITY_OPTIONS = [
  { value: '128k', label: '标准 (128k)' },
  { value: '320k', label: '高品质 (320k)' },
  { value: 'flac', label: '无损 (FLAC)' }
]

function App() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return false
  })
  
  const [keyword, setKeyword] = useState('')
  const [source, setSource] = useState('NeteaseMusicClient')
  const [songs, setSongs] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [currentSong, setCurrentSong] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.8)
  const [quality, setQuality] = useState('320k')
  const [lyrics, setLyrics] = useState([])
  const [currentLyricIndex, setCurrentLyricIndex] = useState(-1)
  const [toast, setToast] = useState(null)
  const [playlist, setPlaylist] = useState([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [qualityModal, setQualityModal] = useState({ show: false, song: null })
  const listRef = useRef(null)
  
  const audioRef = useRef(null)
  const searchInputRef = useRef(null)
  const lyricsRef = useRef(null)

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDark])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e) => setIsDark(e.matches)
    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT') return
      
      switch (e.key) {
        case ' ':
          e.preventDefault()
          togglePlay()
          break
        case 'ArrowLeft':
          e.preventDefault()
          audioRef.current && (audioRef.current.currentTime -= 5)
          break
        case 'ArrowRight':
          e.preventDefault()
          audioRef.current && (audioRef.current.currentTime += 5)
          break
        case 'ArrowUp':
          e.preventDefault()
          setVolume(v => Math.min(1, v + 0.1))
          break
        case 'ArrowDown':
          e.preventDefault()
          setVolume(v => Math.max(0, v - 0.1))
          break
        case 'p':
        case 'P':
          e.preventDefault()
          playPrev()
          break
        case 'n':
        case 'N':
          e.preventDefault()
          playNext()
          break
        case 'm':
        case 'M':
          e.preventDefault()
          setVolume(v => v > 0 ? 0 : 0.8)
          break
        case '/':
          e.preventDefault()
          searchInputRef.current?.focus()
          break
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [playlist])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume
    }
  }, [volume])

  useEffect(() => {
    const listElement = listRef.current
    if (!listElement) return
    
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = listElement
      if (scrollTop + clientHeight >= scrollHeight - 50) {
        handleLoadMore()
      }
    }
    
    listElement.addEventListener('scroll', handleScroll)
    return () => listElement.removeEventListener('scroll', handleScroll)
  }, [hasMore, loadingMore, page])

  const showToast = (message) => {
    setToast(message)
    setTimeout(() => setToast(null), 3000)
  }

  const search = useCallback(async (pageNum = 1, isLoadMore = false) => {
    if (!keyword.trim()) return
    
    if (isLoadMore) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }
    
    try {
      const res = await axios.post(`${API_BASE}/search`, {
        keyword: keyword.trim(),
        page: pageNum,
        page_size: 10,
        source: source || null
      })
      
      const newSongs = res.data.songs || []
      const currentCount = isLoadMore ? songs.length + newSongs.length : newSongs.length
      
      if (isLoadMore) {
        setSongs(prev => [...prev, ...newSongs])
      } else {
        setSongs(newSongs)
      }
      setTotal(res.data.total || 0)
      setPage(res.data.page || 1)
      setHasMore(currentCount < res.data.total)
    } catch (err) {
      showToast('搜索失败: ' + (err.response?.data?.error || err.message))
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [keyword, source])

  const handleSearch = () => {
    setHasMore(true)
    search(1)
  }

  const handleLoadMore = useCallback(() => {
    if (!loadingMore && hasMore && keyword.trim()) {
      search(page + 1, true)
    }
  }, [loadingMore, hasMore, page, keyword, search])

  const playSong = async (song, index) => {
    try {
      const res = await axios.post(`${API_BASE}/play`, {
        song_info: song,
        quality
      })
      
      if (res.data.filepath) {
        setCurrentSong(song)
        setPlaylist(songs.map((s, i) => ({ ...s, index: i })))
        
        if (audioRef.current) {
          audioRef.current.src = res.data.filepath
          audioRef.current.play()
          setIsPlaying(true)
        }
        
        fetchLyrics(song)
      }
    } catch (err) {
      showToast('播放失败: ' + (err.response?.data?.error || err.message))
    }
  }

  const fetchLyrics = async (song) => {
    try {
      const res = await axios.post(`${API_BASE}/lyrics`, { song_info: song })
      if (res.data.lyrics) {
        const lyricLines = res.data.lyrics.split('\n').filter(l => l.trim())
        setLyrics(lyricLines)
      } else {
        setLyrics([])
      }
    } catch {
      setLyrics([])
    }
  }

  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  const playNext = () => {
    if (!currentSong || playlist.length === 0) return
    const currentIndex = playlist.findIndex(s => s.song_id === currentSong.song_id)
    const nextIndex = (currentIndex + 1) % playlist.length
    playSong(playlist[nextIndex], nextIndex)
  }

  const playPrev = () => {
    if (!currentSong || playlist.length === 0) return
    const currentIndex = playlist.findIndex(s => s.song_id === currentSong.song_id)
    const prevIndex = (currentIndex - 1 + playlist.length) % playlist.length
    playSong(playlist[prevIndex], prevIndex)
  }

  const handleDownload = (song) => {
    setQualityModal({ show: true, song })
  }
  
  const confirmDownload = async (qualityValue) => {
    const song = qualityModal.song
    setQualityModal({ show: false, song: null })
    
    if (!song) return
    
    try {
      showToast('开始下载...')
      
      const downloadUrl = `${API_BASE}/download`
      const filename = `${song.artist || 'Unknown'} - ${song.name || 'Unknown'}.${qualityValue || 'mp3'}`
      
      const response = await axios.post(downloadUrl, {
        song_info: song,
        quality: qualityValue,
        save_dir: '/tmp'
      }, {
        responseType: 'blob'
      })
      
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      
      showToast('下载成功')
    } catch (err) {
      showToast('下载失败: ' + (err.response?.data?.error || err.message))
    }
  }

  const handleTimeUpdate = () => {
    if (!audioRef.current) return
    setCurrentTime(audioRef.current.currentTime)
    
    if (lyrics.length > 0) {
      const time = audioRef.current.currentTime
      let idx = -1
      for (let i = 0; i < lyrics.length; i++) {
        const match = lyrics[i].match(/\[(\d+):(\d+)\]/)
        if (match) {
          const lyricTime = parseInt(match[1]) * 60 + parseInt(match[2])
          if (time >= lyricTime) {
            idx = i
          }
        }
      }
      setCurrentLyricIndex(idx)
    }
  }
  
  useEffect(() => {
    if (lyricsRef.current && currentLyricIndex >= 0 && lyrics.length > 0) {
      requestAnimationFrame(() => {
        const lyricElements = lyricsRef.current.querySelectorAll('.lyric-line')
        if (lyricElements[currentLyricIndex]) {
          lyricElements[currentLyricIndex].scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          })
        }
      })
    }
  }, [currentLyricIndex, lyrics.length])

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration)
    }
  }

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '00:00'
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  const getQualityLabel = (q) => {
    const opt = QUALITY_OPTIONS.find(o => o.value === q)
    return opt ? opt.label : q
  }

  return (
    <div className="h-full flex flex-col bg-light-bg dark:bg-dark-bg">
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={playNext}
        onError={() => showToast('播放出错，将尝试切换音源')}
      />
      
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-light-card dark:bg-dark-card border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <svg className="w-8 h-8 text-primary" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
          </svg>
          <h1 className="text-xl font-bold text-light-text dark:text-dark-text">MusicBox</h1>
        </div>
        <button
          onClick={() => setIsDark(!isDark)}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          {isDark ? (
            <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1z"/>
            </svg>
          ) : (
            <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9.37 5.51c-.18.64-.27 1.31-.27 1.99 0 4.08 3.32 7.4 7.4 7.4.68 0 1.35-.09 1.99-.27C17.45 17.19 14.93 19 12 19c-3.86 0-7-3.14-7-7 0-2.93 1.81-5.45 4.37-6.49zM12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/>
            </svg>
          )}
        </button>
      </header>

      {/* Search Bar */}
      <div className="p-4 bg-light-card dark:bg-dark-card border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-2 flex-wrap">
          <input
            ref={searchInputRef}
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="搜索歌曲、歌手..."
            className="flex-1 min-w-[200px] px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text focus:outline-none focus:border-primary"
          />
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-light-card dark:bg-dark-card text-light-text dark:text-dark-text focus:outline-none focus:border-primary"
          >
            <option value="">全部平台</option>
            {Object.entries(SOURCE_NAMES).map(([key, name]) => (
              <option key={key} value={key}>{name}</option>
            ))}
          </select>
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-opacity-90 disabled:opacity-50 flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                <span>搜索中</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
                <span>搜索</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Sidebar - Search Results */}
        <div className="w-full md:w-1/2 lg:w-2/5 flex flex-col border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800">
            <span className="text-sm text-light-muted dark:text-dark-muted">
              {total > 0 ? `${(page-1)*10+1}-${Math.min(page*10, total)} / ${total} 首` : '搜索结果'}
            </span>
            {songs.length > 0 && (
              <button
                onClick={() => { setSongs([]); setTotal(0); setKeyword(''); }}
                className="text-sm text-primary hover:underline"
              >
                清空
              </button>
            )}
          </div>
          
          <div ref={listRef} className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <svg className="w-8 h-8 text-primary animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              </div>
            ) : songs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-light-muted dark:text-dark-muted">
                <svg className="w-16 h-16 mb-2" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                </svg>
                <p>输入关键词搜索歌曲</p>
              </div>
            ) : (
              <ul>
                {songs.map((song, index) => (
                  <li
                    key={`${song.song_id}-${index}`}
                    onClick={() => playSong(song, index)}
                    className={`flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 ${
                      currentSong?.song_id === song.song_id ? 'bg-pink-50 dark:bg-pink-900/20' : ''
                    }`}
                  >
                    <span className="w-6 text-center text-light-muted dark:text-dark-muted text-sm">
                      {currentSong?.song_id === song.song_id && isPlaying ? (
                        <svg className="w-4 h-4 text-primary" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      ) : (
                        (page-1)*10 + index + 1
                      )}
                    </span>
                    {song.album_img ? (
                      <img src={song.album_img} alt="cover" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                        </svg>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-light-text dark:text-dark-text font-medium">{song.name}</p>
                      <p className="truncate text-sm text-light-muted dark:text-dark-muted">{song.artist}</p>
                    </div>
                    <span className="text-xs text-light-muted dark:text-dark-muted">
                      {song._source ? SOURCE_NAMES[song._source] : ''}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDownload(song); }}
                      className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
                    >
                      <svg className="w-4 h-4 text-light-muted dark:text-dark-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            
            {/* Load More / No More Data */}
            {songs.length > 0 && (
              <div className="py-4 text-center text-sm text-light-muted dark:text-dark-muted">
                {loadingMore ? (
                  <div className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    <span>加载中...</span>
                  </div>
                ) : !hasMore ? (
                  <span>暂无更多数据</span>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* Right Content - Player & Lyrics */}
        <div className="w-full md:w-1/2 lg:w-3/5 flex flex-col">
          {/* Player Info */}
          <div className="flex flex-col items-center p-6 bg-light-card dark:bg-dark-card">
            <div className="w-48 h-48 mb-4 rounded-xl bg-gradient-to-br from-primary to-pink-400 flex items-center justify-center shadow-lg">
              {currentSong?.album_img ? (
                <img src={currentSong.album_img} alt="cover" className="w-full h-full object-cover rounded-xl" />
              ) : (
                <svg className="w-24 h-24 text-white/50" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                </svg>
              )}
            </div>
            <h2 className="text-2xl font-bold text-light-text dark:text-dark-text mb-1">
              {currentSong?.name || '未选择歌曲'}
            </h2>
            <p className="text-light-muted dark:text-dark-muted mb-4">
              {currentSong?.artist || '点击歌曲开始播放'}
            </p>
            
            {/* Download Button */}
            {currentSong && (
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => handleDownload(currentSong, '320k')}
                  className="px-4 py-1.5 bg-primary text-white rounded-lg hover:bg-opacity-90 flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                  </svg>
                  下载
                </button>
              </div>
            )}
          </div>

          {/* Lyrics */}
          <div className="flex-1 overflow-y-auto p-4 bg-light-bg dark:bg-dark-bg">
            {lyrics.length > 0 ? (
              <div ref={lyricsRef} className="text-center space-y-3 lyrics-scroll" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {lyrics.map((line, index) => (
                  <p
                    key={index}
                    className={`lyric-line transition-all ${
                      index === currentLyricIndex
                        ? 'text-primary font-bold text-lg scale-105'
                        : 'text-light-muted dark:text-dark-muted'
                    }`}
                  >
                    {line.replace(/\[\d+:\d+\]/g, '').trim()}
                  </p>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-light-muted dark:text-dark-muted">
                <p>暂无歌词，试着播放一首支持歌词的歌曲</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Player Bar */}
      <div className="h-20 flex items-center gap-4 px-4 bg-light-card dark:bg-dark-card border-t border-gray-200 dark:border-gray-700">
        {/* Song Info */}
        <div className="flex items-center gap-3 w-48 md:w-64">
          {currentSong?.album_img ? (
            <img src={currentSong.album_img} alt="cover" className="w-12 h-12 rounded" />
          ) : (
            <div className="w-12 h-12 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
              </svg>
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{currentSong?.name || '未选择歌曲'}</p>
            <p className="truncate text-xs text-light-muted dark:text-dark-muted">{currentSong?.artist}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex-1 flex flex-col items-center">
          <div className="flex items-center gap-4 mb-1">
            <button onClick={playPrev} className="p-1 hover:scale-110 transition-transform">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
              </svg>
            </button>
            <button
              onClick={togglePlay}
              className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center hover:scale-105 transition-transform"
            >
              {isPlaying ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                </svg>
              ) : (
                <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
            </button>
            <button onClick={playNext} className="p-1 hover:scale-110 transition-transform">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
              </svg>
            </button>
          </div>
          <div className="w-full max-w-md flex items-center gap-2 text-xs text-light-muted dark:text-dark-muted">
            <span>{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={(e) => { audioRef.current.currentTime = e.target.value }}
              className="flex-1 h-1 accent-primary"
            />
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Volume & Quality */}
        <div className="hidden md:flex items-center gap-3 w-40">
          <button onClick={() => setVolume(v => v > 0 ? 0 : 0.8)}>
            {volume === 0 ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
              </svg>
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-20 h-1 accent-primary"
          />
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 bg-dark-card text-white rounded-lg shadow-lg text-sm z-50">
          {toast}
        </div>
      )}

      {/* Quality Select Modal */}
      {qualityModal.show && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setQualityModal({ show: false, song: null })}>
          <div className="bg-light-card dark:bg-dark-card rounded-xl p-6 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-light-text dark:text-dark-text mb-4">请选择音质</h3>
            <div className="space-y-3">
              <button
                onClick={() => confirmDownload('128k')}
                className="w-full py-3 px-4 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-light-text dark:text-dark-text"
              >
                标准 (128k)
              </button>
              <button
                onClick={() => confirmDownload('320k')}
                className="w-full py-3 px-4 rounded-lg border border-primary hover:bg-primary/10 text-primary font-medium"
              >
                高品质 (320k)
              </button>
              <button
                onClick={() => confirmDownload('flac')}
                className="w-full py-3 px-4 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-light-text dark:text-dark-text"
              >
                无损 (FLAC)
              </button>
            </div>
            <button
              onClick={() => setQualityModal({ show: false, song: null })}
              className="w-full mt-4 py-2 text-light-muted dark:text-dark-muted hover:text-light-text dark:hover:text-dark-text"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
