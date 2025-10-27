from flask import Flask, jsonify, send_file, request, render_template
import os
import json
from pathlib import Path
import mimetypes
from datetime import datetime
# os.sep='/'
app = Flask(__name__)

# 配置漫画文件夹路径
MANGA_BASE_PATH = r'D:\chrome_download\Sore Demo Machi wa Mawatteiru v09-10\Sore Demo Machi wa Mawatteiru v09-10'

# 支持的图片格式
SUPPORTED_FORMATS = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}

# 配置文件路径
CONFIG_FILE = 'manga_config.json'
HISTORY_FILE = 'reading_history.json'


def load_config():
    """加载配置文件"""
    try:
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return {
            'base_paths': [MANGA_BASE_PATH], 
            'current_base_path': MANGA_BASE_PATH,
            'reading_direction': 'left_to_right'  # 'left_to_right' 或 'right_to_left'
        }

def save_config(config):
    """保存配置文件"""
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=2)

def load_history():
    """加载阅读历史"""
    try:
        with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return []

def save_history(history):
    """保存阅读历史"""
    with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
        json.dump(history, f, ensure_ascii=False, indent=2)

def add_to_history(manga_path, chapter_name, image_index, total_images):
    """添加到阅读历史"""
    history = load_history()
    
    # 移除旧记录（如果存在）
    history = [h for h in history if not (h['manga_path'] == manga_path and h['chapter_name'] == chapter_name)]
    
    # 添加新记录
    new_record = {
        'manga_path': manga_path,
        'chapter_name': chapter_name,
        'image_index': image_index,
        'total_images': total_images,
        'timestamp': datetime.now().isoformat(),
        'progress_percent': round((image_index + 1) / total_images * 100, 1)
    }
    
    history.insert(0, new_record)
    
    # 限制历史记录数量
    history = history[:50]
    
    save_history(history)

def is_image_file(filename):
    """检查文件是否为支持的图片格式"""
    return Path(filename).suffix.lower() in SUPPORTED_FORMATS

def get_current_base_path():
    """获取当前基础路径"""
    config = load_config()
    return config.get('current_base_path', MANGA_BASE_PATH)

def scan_directory(path, current_path=""):
    """递归扫描目录，支持多级结构"""
    items = []
    
    try:
        for item in os.listdir(path):
            item_path = '/'.join([path, item])
            relative_path = '/'.join([current_path, item]) if current_path else item
            
            if os.path.isdir(item_path):
                # 检查是否包含图片文件
                has_images = any(is_image_file(f) for f in os.listdir(item_path) if os.path.isfile('/'.join([item_path, f])))

                # 检查子文件夹
                subdirs = [f for f in os.listdir(item_path) if os.path.isdir('/'.join([item_path, f]))]
                
                items.append({
                    'name': item,
                    'path': relative_path,
                    'type': 'chapter' if has_images else 'manga',
                    'has_images': has_images,
                    'has_subdirs': len(subdirs) > 0,
                    'image_count': sum(1 for f in os.listdir(item_path) if is_image_file(f)) if has_images else 0
                })
    except PermissionError:
        pass
    
    return sorted(items, key=lambda x: (x['type'] == 'chapter', x['name']))

def get_manga_list(path=""):
    """获取漫画列表，支持多级目录"""
    base_path = get_current_base_path()
    full_path = '/'.join([base_path, path]) if path else base_path
    
    if not os.path.exists(full_path):
        return []
    
    return scan_directory(full_path, path)

def get_manga_images(manga_path):
    """获取指定漫画章节的所有图片"""
    base_path = get_current_base_path()
    full_path = '/'.join([base_path, manga_path])
    print(f"Getting images from path:{base_path} \n {manga_path}\n{full_path}")
    if not os.path.exists(full_path):
        return []
    
    images = []
    for filename in os.listdir(full_path):
        if is_image_file(filename):
            images.append(filename)
    
    # 智能排序：尝试按数字排序，失败则按字符串排序
    try:
        images.sort(key=lambda x: int(''.join(filter(str.isdigit, os.path.splitext(x)[0])) or '0'))
    except:
        images.sort()
    
    return images

def get_adjacent_chapters(current_manga_path):
    """获取相邻章节信息"""
    base_path = get_current_base_path()
    
    # 分析当前路径，找到父目录
    path_parts = current_manga_path.split('/')
    if len(path_parts) <= 1:
        return {'previous': None, 'next': None}
    
    parent_path = '/'.join(path_parts[:-1])
    current_chapter = path_parts[-1]
    
    # 获取父目录下所有章节
    parent_full_path = '/'.join([base_path, parent_path]) if parent_path else base_path
    
    try:
        chapters = []
        for item in os.listdir(parent_full_path):
            item_path = '/'.join([parent_full_path, item])
            if os.path.isdir(item_path):
                # 检查是否包含图片文件
                has_images = any(is_image_file(f) for f in os.listdir(item_path) if os.path.isfile('/'.join([item_path, f])))
                if has_images:
                    chapters.append(item)
        
        chapters.sort()
        
        try:
            current_index = chapters.index(current_chapter)
            previous_chapter = chapters[current_index - 1] if current_index > 0 else None
            next_chapter = chapters[current_index + 1] if current_index < len(chapters) - 1 else None
            
            return {
                'previous': '/'.join([parent_path, previous_chapter]) if previous_chapter and parent_path else previous_chapter,
                'next': '/'.join([parent_path, next_chapter]) if next_chapter and parent_path else next_chapter
            }
        except ValueError:
            return {'previous': None, 'next': None}
    except:
        return {'previous': None, 'next': None}

@app.route('/')
def index():
    """主页"""
    return render_template('index.html')

@app.route('/api/manga')
def api_manga_list():
    """API: 获取漫画列表"""
    try:
        path = request.args.get('path', '')
        print(f"Fetching manga list for path: {path}")
        manga_list = get_manga_list(path)
        return jsonify({
            'success': True,
            'data': manga_list,
            'current_path': path
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/manga/<path:manga_path>')
def api_manga_images(manga_path):
    """API: 获取指定漫画章节的图片列表"""
    try:
        images = get_manga_images(manga_path)
        adjacent_chapters = get_adjacent_chapters(manga_path)
        print(f"Fetching images for manga path: {manga_path}, found {len(images)} images")
        return jsonify({
            'success': True,
            'data': {
                'manga_path': manga_path,
                'images': images,
                'adjacent_chapters': adjacent_chapters
            }
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/image/<path:manga_path>/<filename>')
def api_serve_image(manga_path, filename):
    """API: 提供图片文件"""
    try:
        base_path = get_current_base_path()
        image_path = '/'.join([base_path, manga_path, filename])
        
        if not os.path.exists(image_path):
            return jsonify({
                'success': False,
                'error': 'Image not found'
            }), 404
        
        if not is_image_file(filename):
            return jsonify({
                'success': False,
                'error': 'File is not a supported image format'
            }), 400

        return send_file(image_path, mimetype=mimetypes.guess_type(image_path)[0], max_age=24*3600)

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/config')
def api_get_config():
    """API: 获取配置"""
    try:
        config = load_config()
        return jsonify({
            'success': True,
            'data': config
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/config', methods=['POST'])
def api_update_config():
    """API: 更新配置"""
    try:
        data = request.get_json()
        config = load_config()
        
        if 'base_paths' in data:
            config['base_paths'] = data['base_paths']
        if 'current_base_path' in data:
            config['current_base_path'] = data['current_base_path']
        if 'reading_direction' in data:
            config['reading_direction'] = data['reading_direction']
        if 'reading_direction' in data:
            config['preload_buffer'] = data['preload_buffer']
        
        save_config(config)
        
        return jsonify({
            'success': True,
            'message': '配置已保存'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/history')
def api_get_history():
    """API: 获取阅读历史"""
    try:
        history = load_history()
        return jsonify({
            'success': True,
            'data': history
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/history', methods=['POST'])
def api_add_history():
    """API: 添加阅读历史"""
    try:
        data = request.get_json()
        add_to_history(
            data['manga_path'],
            data['chapter_name'],
            data['image_index'],
            data['total_images']
        )
        
        return jsonify({
            'success': True,
            'message': '已保存阅读进度'
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/history/<int:index>', methods=['DELETE'])
def api_delete_history(index):
    """API: 删除阅读历史记录"""
    try:
        history = load_history()
        if 0 <= index < len(history):
            history.pop(index)
            save_history(history)
            return jsonify({
                'success': True,
                'message': '记录已删除'
            })
        else:
            return jsonify({
                'success': False,
                'error': '记录不存在'
            }), 404
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    config = load_config()
    current_path = config.get('current_base_path', MANGA_BASE_PATH)
    print(f"当前漫画文件夹路径: {current_path}")
    print("支持多级目录结构，可在设置中添加更多路径")
    app.run(debug=True, host='0.0.0.0', port=15000)
