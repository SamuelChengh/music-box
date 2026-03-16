import os
import json
from musicdl import musicdl

SOURCES = [
    'MiguMusicClient',
    'NeteaseMusicClient', 
    'QQMusicClient',
    'KuwoMusicClient',
    'KugouMusicClient'
]

QUALITY_MAP = {
    '128k': 'standard',
    '320k': 'high',
    'flac': 'lossless'
}

class MusicClient:
    def __init__(self):
        self.client = musicdl.MusicClient(music_sources=SOURCES)
        self.current_results = []
        
    def search(self, keyword, page=1, page_size=10, source=None):
        sources = [source] if source else SOURCES
        self.client = musicdl.MusicClient(music_sources=sources)
        
        results = self.client.search(keyword=keyword)
        
        all_songs = []
        for source_name, songs in results.items():
            for song in songs:
                song['_source'] = source_name
                all_songs.append(song)
        
        all_songs = self._deduplicate(all_songs)
        
        total = len(all_songs)
        start = (page - 1) * page_size
        end = start + page_size
        page_data = all_songs[start:end]
        
        return {
            'songs': page_data,
            'total': total,
            'page': page,
            'page_size': page_size
        }
    
    def _deduplicate(self, songs):
        seen = {}
        for song in songs:
            key = f"{song.get('name', '')}-{song.get('artist', '')}"
            if key not in seen:
                seen[key] = song
            else:
                if self._compare_quality(song, seen[key]):
                    seen[key] = song
        return list(seen.values())
    
    def _compare_quality(self, song1, song2):
        q1 = song1.get('quality', '128k')
        q2 = song2.get('quality', '128k')
        order = ['128k', '320k', 'flac']
        return order.index(q1) > order.index(q2) if q1 in order and q2 in order else False
    
    def get_play_url(self, song_info, quality='320k'):
        source = song_info.get('_source')
        if not source:
            return None, 'Unknown source'
        
        client_class = getattr(__import__(f'musicdl.modules.sources.{source.lower()}', 
                                          fromlist=[source]), source)
        client = client_class()
        
        song_data = {
            'name': song_info.get('name'),
            'artist': song_info.get('artist'),
            'album': song_info.get('album'),
            'duration': song_info.get('duration'),
            'size': song_info.get('size'),
            'rate': song_info.get('rate'),
            'album_id': song_info.get('album_id'),
            'artist_id': song_info.get('artist_id'),
            'song_id': song_info.get('song_id'),
            'source': song_info.get('source'),
            'source_url': song_info.get('source_url')
        }
        
        try:
            results = client.download(song_infos=[song_data], 
                                     quality=QUALITY_MAP.get(quality, 'high'),
                                     work_dir='/tmp/musicdl')
            if results and len(results) > 0:
                return results[0].get('filepath'), None
        except Exception as e:
            return None, str(e)
        
        return None, 'Download failed'
    
    def get_lyrics(self, song_info):
        source = song_info.get('_source')
        if not source:
            return None
        
        try:
            client_class = getattr(__import__(f'musicdl.modules.sources.{source.lower()}',
                                            fromlist=[source]), source)
            client = client_class()
            lyrics = client.searchlyrics(keyword=f"{song_info.get('name')} {song_info.get('artist')}")
            return lyrics if lyrics else None
        except:
            return None
    
    def get_sources(self):
        return SOURCES

music_client = MusicClient()
