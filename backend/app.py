import os
import shutil
import tempfile
from flask import Flask, request, jsonify
from flask_cors import CORS
from musicdl import musicdl

app = Flask(__name__)
CORS(app)

SOURCES = [
    'MiguMusicClient',
    'NeteaseMusicClient',
    'QQMusicClient',
    'KuwoMusicClient',
    'KugouMusicClient'
]

class MusicClientWrapper:
    def __init__(self):
        self.search_cache = {}
    
    def search(self, keyword, page=1, page_size=10, source=None):
        cache_key = f"{keyword}_{source}"
        
        if cache_key not in self.search_cache:
            sources = [source] if source else SOURCES
            
            init_cfg = {}
            for s in sources:
                init_cfg[s] = {'search_size_per_source': 50}
            
            client = musicdl.MusicClient(
                music_sources=sources,
                init_music_clients_cfg=init_cfg
            )
            results = client.search(keyword=keyword)
            
            all_songs = []
            for source_name, songs in results.items():
                for song in songs:
                    all_songs.append(self._normalize_song(song, source_name))
            
            all_songs = self._deduplicate(all_songs)
            self.search_cache[cache_key] = all_songs
        
        all_songs = self.search_cache[cache_key]
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
    
    def _normalize_song(self, song, source):
        return {
            'name': getattr(song, 'song_name', 'Unknown'),
            'artist': getattr(song, 'singers', 'Unknown'),
            'album': getattr(song, 'album', ''),
            'duration': getattr(song, 'duration_s', 0),
            'duration_str': getattr(song, 'duration', '00:00'),
            'song_id': str(getattr(song, 'identifier', id(song))),
            '_source': source,
            'album_img': getattr(song, 'cover_url', None),
            'quality': getattr(song, 'ext', 'mp3'),
            'download_url': getattr(song, 'download_url', None),
            'lyric': getattr(song, 'lyric', None)
        }
    
    def _deduplicate(self, songs):
        seen = {}
        for song in songs:
            key = f"{song.get('name', '')}-{song.get('artist', '')}"
            if key not in seen:
                seen[key] = song
            else:
                old_ext = seen[key].get('quality', 'mp3')
                new_ext = song.get('quality', 'mp3')
                if self._compare_quality(new_ext, old_ext):
                    seen[key] = song
        return list(seen.values())
    
    def _compare_quality(self, q1, q2):
        order = {'mp3': 0, 'flac': 1, 'wav': 2}
        return order.get(q1, 0) > order.get(q2, 0)

music_client = MusicClientWrapper()

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
    
    try:
        result = music_client.search(keyword, page, page_size, source)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

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
    quality = data.get('quality', '320k')
    save_dir = data.get('save_dir')
    
    if not save_dir:
        return jsonify({'error': '请选择保存目录'}), 400
    
    try:
        download_url = song_info.get('download_url')
        if not download_url:
            return jsonify({'error': '无法获取下载链接'}), 400
        
        import requests
        
        filename = f"{song_info.get('artist', 'Unknown')} - {song_info.get('name', 'Unknown')}"
        ext = download_url.split('.')[-1].split('?')[0] or 'flac'
        dest_path = os.path.join(save_dir, f"{filename}.{ext}")
        
        os.makedirs(save_dir, exist_ok=True)
        
        response = requests.get(download_url, stream=True)
        with open(dest_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
        
        return jsonify({'success': True, 'path': dest_path})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)
