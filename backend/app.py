import os
import time
import requests
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from urllib.parse import quote
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

app = Flask(__name__)
CORS(app)

SOURCES = [
    'NeteaseMusicClient',
    'MiguMusicClient',
    'QQMusicClient',
    'KuwoMusicClient',
    'KugouMusicClient'
]

API_SOURCES = {
    'KuwoMusicClient': 'kuwo',
    'MiguMusicClient': 'migu',
    'QQMusicClient': 'qq'
}

API_URLS = {
    'kuwo': 'https://kw-api.cenguigui.cn/',
    'migu': 'https://api.xcvts.cn/api/music/migu',
    'qq': 'https://tang.api.s01s.cn/music_open_api.php'
}

class SearchCache:
    def __init__(self, ttl=3600):
        self.cache = {}
        self.ttl = ttl
        self.lock = threading.Lock()
    
    def get(self, key):
        with self.lock:
            if key in self.cache:
                data, timestamp = self.cache[key]
                if time.time() - timestamp < self.ttl:
                    return data
                else:
                    del self.cache[key]
        return None
    
    def set(self, key, data):
        with self.lock:
            self.cache[key] = (data, time.time())

search_cache = SearchCache(ttl=3600)

def search_kuwo(keyword, page=1, page_size=10):
    try:
        url = API_URLS['kuwo']
        params = {
            'name': keyword,
            'page': page,
            'limit': page_size
        }
        response = requests.get(url, params=params, timeout=10)
        data = response.json()
        
        if data.get('code') == 200:
            songs = []
            for item in data.get('data', []):
                songs.append({
                    'name': item.get('name', 'Unknown'),
                    'artist': item.get('artist', 'Unknown'),
                    'album': item.get('album', ''),
                    'duration': 0,
                    'duration_str': '00:00',
                    'song_id': str(item.get('rid', item.get('vid', ''))),
                    '_source': 'KuwoMusicClient',
                    'album_img': item.get('pic', None),
                    'quality': 'mp3',
                    'download_url': item.get('url', None),
                    'lyric': item.get('lrc', None)
                })
            return {'songs': songs, 'total': data.get('total', len(songs))}
    except Exception as e:
        print(f"Kuwo search error: {e}")
    return None

def search_migu(keyword, page=1, page_size=10):
    try:
        url = API_URLS['migu']
        params = {
            'gm': keyword,
            'n': page,
            'num': page_size,
            'type': 'json'
        }
        response = requests.get(url, params=params, timeout=10)
        data = response.json()
        
        if data.get('code') == 200:
            songs = []
            for item in data.get('data', []):
                songs.append({
                    'name': item.get('title', 'Unknown'),
                    'artist': item.get('singer', 'Unknown'),
                    'album': '',
                    'duration': 0,
                    'duration_str': '00:00',
                    'song_id': str(item.get('n', '')),
                    '_source': 'MiguMusicClient',
                    'album_img': None,
                    'quality': 'mp3',
                    'download_url': None,
                    'lyric': None
                })
            return {'songs': songs, 'total': len(songs)}
    except Exception as e:
        print(f"Migu search error: {e}")
    return None

def search_qq(keyword, page=1, page_size=10):
    try:
        url = API_URLS['qq']
        params = {
            'msg': keyword,
            'type': 'json'
        }
        response = requests.get(url, params=params, timeout=10)
        data = response.json()
        
        if isinstance(data, list):
            songs = []
            for item in data:
                songs.append({
                    'name': item.get('song_title', 'Unknown'),
                    'artist': item.get('singer_name', 'Unknown'),
                    'album': '',
                    'duration': 0,
                    'duration_str': '00:00',
                    'song_id': str(item.get('song_mid', '')),
                    '_source': 'QQMusicClient',
                    'album_img': None,
                    'quality': 'mp3',
                    'download_url': None,
                    'lyric': None
                })
            return {'songs': songs, 'total': len(songs)}
    except Exception as e:
        print(f"QQ search error: {e}")
    return None

API_SEARCH_FUNCTIONS = {
    'KuwoMusicClient': search_kuwo,
    'MiguMusicClient': search_migu,
    'QQMusicClient': search_qq
}

def search_with_apis(keyword, page=1, page_size=10, source=None):
    results = []
    
    if source and source in API_SEARCH_FUNCTIONS:
        sources_to_try = [source]
    else:
        sources_to_try = ['KuwoMusicClient', 'MiguMusicClient', 'QQMusicClient']
    
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {
            executor.submit(API_SEARCH_FUNCTIONS[s], keyword, page, page_size): s 
            for s in sources_to_try if s in API_SEARCH_FUNCTIONS
        }
        
        for future in as_completed(futures, timeout=15):
            try:
                result = future.result()
                if result and result.get('songs'):
                    return result
            except Exception as e:
                continue
    
    return None

def deduplicate_songs(songs):
    seen = {}
    for song in songs:
        key = f"{song.get('name', '')}-{song.get('artist', '')}"
        if key not in seen:
            seen[key] = song
    return list(seen.values())

@app.route('/api/sources', methods=['GET'])
def get_sources():
    return jsonify({'sources': SOURCES})

@app.route('/api/search', methods=['POST'])
def search():
    data = request.json
    keyword = data.get('keyword', '')
    page = data.get('page', 1)
    page_size = data.get('page_size', 10)
    source = data.get('source')
    
    if not keyword:
        return jsonify({'error': '关键词不能为空'}), 400
    
    cache_key = f"{keyword}_{source}_{page}_{page_size}"
    cached = search_cache.get(cache_key)
    if cached:
        return jsonify(cached)
    
    result = search_with_apis(keyword, page, page_size, source)
    
    if result:
        songs = deduplicate_songs(result.get('songs', []))
        total = len(songs)
        start = (page - 1) * page_size
        end = start + page_size
        page_data = songs[start:end]
        
        response = {
            'songs': page_data,
            'total': total,
            'page': page,
            'page_size': page_size
        }
        search_cache.set(cache_key, response)
        return jsonify(response)
    
    return jsonify({'error': '搜索失败，请稍后重试'}), 500

@app.route('/api/play', methods=['POST'])
def play():
    data = request.json
    song_info = data.get('song_info', {})
    
    download_url = song_info.get('download_url')
    if download_url:
        return jsonify({'filepath': download_url})
    
    return jsonify({'error': '无法获取播放链接'}), 400

@app.route('/api/lyrics', methods=['POST'])
def lyrics():
    data = request.json
    song_info = data.get('song_info', {})
    
    try:
        lyrics = song_info.get('lyric')
        return jsonify({'lyrics': lyrics})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/download', methods=['POST'])
def download():
    data = request.json
    song_info = data.get('song_info', {})
    
    try:
        download_url = song_info.get('download_url')
        if not download_url:
            return jsonify({'error': '无法获取下载链接'}), 400
        
        filename = f"{song_info.get('artist', 'Unknown')} - {song_info.get('name', 'Unknown')}"
        ext = download_url.split('.')[-1].split('?')[0] or 'flac'
        
        def generate():
            response = requests.get(download_url, stream=True)
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    yield chunk
        
        response = Response(generate(), content_type='application/octet-stream')
        response.headers['Content-Disposition'] = f"attachment; filename={quote(filename)}.{quote(ext)}"
        return response
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)
