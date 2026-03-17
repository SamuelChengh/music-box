import { useState, useEffect, useRef } from 'react'
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

const THEME_COLORS = [
  { name: '红色', value: '#e94560' },
  { name: '绿色', value: '#10B981' },
  { name: '蓝色', value: '#3B82F6' },
  { name: '紫色', value: '#8B5CF6' },
  { name: '橙色', value: '#F59E0B' },
  { name: '粉色', value: '#EC4899' },
]

function App() {
  const [themeColor, setThemeColor] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('themeColor') || '#10B981'
    }
    return '#10B981'
  })
  
  const [themeModal, setThemeModal] = useState(false)
  const [isDark, setIsDark] = useState(false)
  
  const [keyword, setKeyword] = useState('')
  const [source, setSource] = useState('QQMusicClient')
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
  const [toast, setToast] = useState(null)
  const [playlist, setPlaylist] = useState([])
  const [qualityModal, setQualityModal] = useState({ show: false, song: null })
  
  const audioRef = useRef(null)
  const searchInputRef = useRef(null)

  useEffect(() => {
    document.documentElement.style.setProperty('--color-primary', themeColor)
    localStorage.setItem('themeColor', themeColor)
  }, [themeColor])

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDark])

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && qualityModal.show) {
        setQualityModal({ show: false, song: null })
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [qualityModal.show])

  const showToast = (message) => {
    setToast(message)
    setTimeout(() => setToast(null), 3000)
  }

  const handleSearch = async () => {
    if (!keyword.trim()) {
      showToast('请输入搜索关键词')
      return
    }
    
    setLoading(true)
    setPage(1)
    
    try {
      const response = await axios.post(`${API_BASE}/search`, {
        keyword: keyword.trim(),
        page: 1,
        page_size: 20,
        source
      })
      
      setSongs(response.data.songs || [])
      setTotal(response.data.total || 0)
      
      if (response.data.songs?.length > 0) {
        setPlaylist(response.data.songs)
      }
    } catch (error) {
      showToast('搜索失败，请重试')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handlePlay = async (song) => {
    try {
      setCurrentSong(song)
      setIsPlaying(true)
      
      const response = await axios.post(`${API_BASE}/play`, { song_info: song })
      const url = response.data.filepath
      
      if (audioRef.current) {
        audioRef.current.src = url
        audioRef.current.play()
      }
    } catch (error) {
      showToast('播放失败，将尝试切换音源')
    }
  }

  const togglePlay = () => {
    if (!currentSong) return
    
    if (isPlaying) {
      audioRef.current?.pause()
    } else {
      audioRef.current?.play()
    }
    setIsPlaying(!isPlaying)
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration)
    }
  }

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value)
    setVolume(newVolume)
    if (audioRef.current) {
      audioRef.current.volume = newVolume
    }
  }

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value)
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setCurrentTime(time)
    }
  }

  const formatTime = (time) => {
    if (!time || isNaN(time)) return '00:00'
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
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
      const filename = `${song.artist || 'Unknown'} - ${song.name || 'Unknown'}`
      
      const response = await axios.post(downloadUrl, {
        song_info: song,
        quality: qualityValue,
        save_dir: '/tmp'
      }, {
        responseType: 'blob'
      })

      const blob = new Blob([response.data])
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${filename}.${qualityValue === 'flac' ? 'flac' : 'mp3'}`
      link.click()
      window.URL.revokeObjectURL(url)
      showToast('下载完成')
    } catch (error) {
      showToast('下载失败')
      console.error(error)
    }
  }

  const playNext = () => {
    if (!currentSong || playlist.length === 0) return
    
    const currentIndex = playlist.findIndex(s => s.song_id === currentSong.song_id)
    const nextIndex = (currentIndex + 1) % playlist.length
    handlePlay(playlist[nextIndex])
  }

  const playPrev = () => {
    if (!currentSong || playlist.length === 0) return
    
    const currentIndex = playlist.findIndex(s => s.song_id === currentSong.song_id)
    const prevIndex = currentIndex === 0 ? playlist.length - 1 : currentIndex - 1
    handlePlay(playlist[prevIndex])
  }

  return (
    <div className={`h-screen flex flex-col ${isDark ? 'dark' : ''} bg-gray-50 dark:bg-gray-900`}>
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={playNext}
        onError={() => showToast('播放出错')}
      />
      
      {/* 免责声明 */}
      <div className="py-1 text-center text-xs text-orange-600 dark:text-orange-400 bg-white dark:bg-gray-800 flex-shrink-0">
        ⚠️ 本项目仅供个人学习使用，请支持正版 🎶
      </div>
      
      {/* 顶部导航栏 */}
      <header className="h-14 bg-white dark:bg-gray-800 flex items-center px-2 md:px-4 gap-1 md:gap-4 flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-1 md:gap-2 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeColor}99)` }}>
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
            </svg>
          </div>
          <span className="text-lg font-bold text-gray-800 dark:text-white hidden sm:inline">MusicBox</span>
        </div>
        
        {/* 搜索框 */}
        <div className="flex-1 flex items-center gap-1 md:gap-2 min-w-0">
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-16 md:w-24 px-1 md:px-3 py-1.5 text-xs md:text-sm rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none flex-shrink-0"
            style={{ borderColor: themeColor }}
          >
            {Object.entries(SOURCE_NAMES).map(([key, name]) => (
              <option key={key} value={key}>{name}</option>
            ))}
          </select>
          
          <input
            ref={searchInputRef}
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="搜索歌曲..."
            className="flex-1 min-w-0 px-2 md:px-4 py-1.5 text-sm rounded-full bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2"
            style={{ '--tw-ring-color': themeColor }}
          />
          
          <button
            onClick={handleSearch}
            disabled={loading}
            className="p-1.5 md:p-2 rounded-full text-white disabled:opacity-50 flex-shrink-0"
            style={{ backgroundColor: themeColor }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </button>
        </div>
        
        {/* 右侧功能按钮 */}
        <div className="flex items-center gap-2">
          {/* 主题颜色 */}
          <div className="relative">
            <button
              onClick={() => setThemeModal(!themeModal)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <div className="w-5 h-5 rounded-full border-2 border-white dark:border-gray-600" style={{ backgroundColor: themeColor }} />
            </button>
            {themeModal && (
              <div className="absolute right-0 top-full mt-2 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 flex gap-2 z-50">
                {THEME_COLORS.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => { setThemeColor(color.value); setThemeModal(false); }}
                    className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${themeColor === color.value ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`}
                    style={{ backgroundColor: color.value }}
                  />
                ))}
              </div>
            )}
          </div>
          
          {/* 深浅模式 */}
          <button onClick={() => setIsDark(!isDark)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            {isDark ? (
              <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1z"/>
              </svg>
            ) : (
              <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9.37 5.51c-.18.64-.27 1.31-.27 1.99 0 4.08 3.32 7.4 7.4 7.4.68 0 1.35-.09 1.99-.27C17.45 17.19 14.93 19 12 19c-3.86 0-7-3.14-7-7 0-2.93 1.81-5.45 4.37-6.49zM12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/>
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* 主内容区 */}
      <div className="flex-1 flex overflow-hidden pb-20 md:pb-0">
        {/* 中间主内容 */}
        <main className="flex-1 flex overflow-hidden">
          {/* 歌曲列表 */}
          <div className="flex-1 overflow-y-auto">
            {/* 结果标题 */}
            {songs.length > 0 && (
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  找到 {total} 首歌曲
                </span>
                <button
                  onClick={() => { setSongs([]); setTotal(0); setKeyword(''); }}
                  className="text-sm hover:underline"
                  style={{ color: themeColor }}
                >
                  清空
                </button>
              </div>
            )}
            
            {/* 歌曲列表 */}
            <div>
              {/* 歌曲项 - 移动端简化布局 */}
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24" style={{ color: themeColor }}>
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                </div>
              ) : songs.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 min-h-[300px] text-gray-400">
                  <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/>
                  </svg>
                  <p>搜索歌曲开始体验</p>
                </div>
              ) : (
                songs.map((song, index) => (
                  <div
                    key={song.song_id || index}
                    onClick={() => handlePlay(song)}
                    className={`flex items-center gap-2 md:gap-3 px-2 md:px-4 py-2 md:py-3 text-xs md:text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 ${
                      currentSong?.song_id === song.song_id ? 'bg-gray-100 dark:bg-gray-700' : ''
                    }`}
                  >
                    {/* 序号/播放图标 */}
                    <div className="w-6 md:w-8 text-center text-gray-400 flex-shrink-0">
                      {currentSong?.song_id === song.song_id && isPlaying ? (
                        <div className="flex gap-0.5 justify-center">
                          <span className="w-0.5 h-3 md:h-4 animate-pulse" style={{ backgroundColor: themeColor, animationDelay: '0ms' }}></span>
                          <span className="w-0.5 h-3 md:h-4 animate-pulse" style={{ backgroundColor: themeColor, animationDelay: '150ms' }}></span>
                          <span className="w-0.5 h-3 md:h-4 animate-pulse" style={{ backgroundColor: themeColor, animationDelay: '300ms' }}></span>
                        </div>
                      ) : (
                        <span className="hidden md:inline">{index + 1}</span>
                      )}
                    </div>
                    
                    {/* 封面 */}
                    <div className="w-8 h-8 md:w-10 md:h-10 rounded flex-shrink-0 overflow-hidden">
                      {song.album_img ? (
                        <img src={song.album_img} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
                          <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                          </svg>
                        </div>
                      )}
                    </div>
                    
                    {/* 歌曲信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-gray-800 dark:text-white">{song.name}</div>
                      <div className="truncate text-xs text-gray-500 dark:text-gray-400 md:hidden">{song.artist}</div>
                    </div>
                    
                    {/* 歌手 - 桌面端显示 */}
                    <div className="hidden md:block flex-1 truncate text-gray-500 dark:text-gray-400">{song.artist}</div>
                    
                    {/* 时长 */}
                    <div className="text-gray-400 text-xs md:text-sm flex-shrink-0">{song.duration_str || '00:00'}</div>
                    
                    {/* 操作 */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDownload(song); }}
                      className="p-1 md:p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0"
                      title="下载"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </main>
      </div>

      {/* 底部播放栏 */}
      <div className="h-16 md:h-20 flex items-center gap-1 md:gap-4 px-2 md:px-4 bg-white dark:bg-gray-800">
        {/* 歌曲信息 */}
        <div className="flex items-center gap-2 md:gap-3 w-20 md:w-40 flex-shrink-0">
          {currentSong?.album_img ? (
            <img src={currentSong.album_img} alt="cover" className="w-8 h-8 md:w-12 md:h-12 rounded flex-shrink-0" />
          ) : (
            <div className="w-8 h-8 md:w-12 md:h-12 rounded flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: themeColor + '20' }}>
                  <svg className="w-4 h-4 md:w-6 md:h-6" fill="currentColor" viewBox="0 0 24 24" style={{ color: themeColor }}>
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                  </svg>
                </div>
          )}
          <div className="min-w-0 hidden md:block">
            <p className="truncate text-xs md:text-sm font-medium text-gray-800 dark:text-white">{currentSong?.name || '未选择歌曲'}</p>
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">{currentSong?.artist}</p>
          </div>
        </div>

        {/* 播放控制 */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="flex items-center gap-2 md:gap-4">
            <button onClick={playPrev} className="p-1 hover:scale-110 transition-transform text-gray-600 dark:text-gray-300">
              <svg className="w-4 h-4 md:h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
              </svg>
            </button>
            <button
              onClick={togglePlay}
              className="w-8 h-8 md:w-12 md:h-12 rounded-full text-white flex items-center justify-center hover:scale-105 transition-transform"
              style={{ backgroundColor: themeColor }}
            >
              {isPlaying ? (
                <svg className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                </svg>
              ) : (
                <svg className="w-4 h-4 md:w-5 md:h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
            </button>
            <button onClick={playNext} className="p-1 hover:scale-110 transition-transform text-gray-600 dark:text-gray-300">
              <svg className="w-4 h-4 md:h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
              </svg>
            </button>
          </div>
          {/* 进度条 - 移动端也显示 */}
          <div className="flex w-full md:max-w-md md:mx-auto items-center gap-1 md:gap-2 text-xs text-gray-500 dark:text-gray-400 mt-1">
            <span className="w-8 md:w-10 text-right">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={(e) => { audioRef.current.currentTime = e.target.value }}
              className="flex-1 h-1 rounded-full"
              style={{ accentColor: themeColor }}
            />
            <span className="w-8 md:w-10">{formatTime(duration)}</span>
          </div>
        </div>

        {/* 音量控制 - 移动端也显示 */}
        <div className="flex md:hidden items-center gap-1">
          <button onClick={() => setVolume(v => v > 0 ? 0 : 0.8)} className="text-gray-500 dark:text-gray-400 p-1">
            {volume === 0 ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
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
            className="w-16 h-1 rounded-full"
            style={{ accentColor: themeColor }}
          />
        </div>

        {/* 音量控制 - 桌面端显示 */}
        <div className="hidden md:flex items-center gap-2 w-40 flex-shrink-0 justify-end">
          <button onClick={() => setVolume(v => v > 0 ? 0 : 0.8)} className="text-gray-500 dark:text-gray-400">
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
            className="w-20 h-1 rounded-full"
            style={{ accentColor: themeColor }}
          />
        </div>
      </div>

      {/* 音质选择弹窗 */}
      {qualityModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setQualityModal({ show: false, song: null })}>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 w-64 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-medium text-gray-800 dark:text-white mb-4">选择音质</h3>
            <div className="space-y-2">
              {QUALITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => confirmDownload(option.value)}
                  className="w-full px-4 py-2 text-left rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-white"
                  style={quality === option.value ? { backgroundColor: `${themeColor}20`, color: themeColor } : {}}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Toast 提示 */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg shadow-lg text-white text-sm z-50" style={{ backgroundColor: themeColor }}>
          {toast}
        </div>
      )}
    </div>
  )
}

export default App
