// 全局变量
let currentManga = null;
let currentImages = [];
let currentImageIndex = 0;
let preloadBuffer = 3; // 预加载缓冲数量
let imageCache = new Set(); // 图片缓存
let currentPath = ''; // 当前路径
let breadcrumbHistory = []; // 路径历史
let currentView = 'list'; // 当前视图: list, reader, history, settings
let adjacentChapters = { previous: null, next: null }; // 相邻章节信息
let readingDirection = 'left_to_right'; // 阅读方向
let sliderTimeout = null; // 滑动条超时
let currentBasePath='/'; // 当前基础路径
let basePaths = []; // 基础路径列表

// 初始化应用
document.addEventListener('DOMContentLoaded', function() {
    // loadMangaList();
    updateBreadcrumb();
});

// 加载漫画列表
async function loadMangaList(path = currentPath) {
    try {
        showLoadingList(true);
        const url = `/api/manga${path ? '?path=' + encodeURIComponent(path) : ''}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.success) {
            currentPath = data.current_path || '';
            displayMangaList(data.data);
            updateBreadcrumb();
        } else {
            showError('加载漫画列表失败: ' + data.error);
        }
    } catch (error) {
        showError('网络错误: ' + error.message);
    } finally {
        showLoadingList(false);
    }
}

// 显示漫画列表
function displayMangaList(mangaList) {
    const mangaGrid = document.getElementById('mangaGrid');
    
    if (mangaList.length === 0) {
        mangaGrid.innerHTML = `
            <div class="manga-card" style="grid-column: 1 / -1; text-align: center; cursor: default;">
                <h3>📚 暂无内容</h3>
                <p>该文件夹为空或无法访问</p>
            </div>
        `;
        return;
    }
    
    mangaGrid.innerHTML = mangaList.map(item => {
        const icon = item.type === 'manga' ? '📁' : '📖';
        const action = item.type === 'manga' ? `navigateToFolder('${item.path}')` : `openManga('${item.path}')`;
        const subtitle = item.type === 'manga' ? 
            (item.has_subdirs ? '包含子文件夹' : '无子文件夹') : 
            `📄 ${item.image_count} 张图片`;
            
        return `
            <div class="manga-card" onclick="${action}">
                <h3>${icon} ${item.name}</h3>
                <p>${subtitle}</p>
            </div>
        `;
    }).join('');
}

// 打开漫画章节
async function openManga(mangaPath) {
    try {
        // showLoadingReader(true);
        console.log(`Opening manga: ${mangaPath}`);
        const response = await fetch(`/api/manga/${encodeURIComponent(mangaPath)}`);
        const data = await response.json();
        
        if (data.success) {
            currentManga = mangaPath;
            currentImages = data.data.images;
            adjacentChapters = data.data.adjacent_chapters || { previous: null, next: null };
            currentImageIndex = 0;
            
            if (currentImages.length > 0) {
                showReaderView();
                loadCurrentImage();
                initializeSlider();
            } else {
                showError('该漫画章节中没有图片文件');
            }
        } else {
            showError('加载漫画失败: ' + data.error);
        }
    } catch (error) {
        showError('网络错误: ' + error.message);
    } finally {
        // showLoadingReader(false);
    }
}

// 显示阅读器视图
function showReaderView() {
    hideAllViews();
    document.getElementById('mangaReaderView').style.display = 'block';
    document.getElementById('backBtn').style.display = 'block';
    document.getElementById('currentMangaName').textContent = currentManga.split(/[/\\]/).pop() || currentManga;
    currentView = 'reader';
    updateImageCounter();
    updateCurrentFileName();
}

// 返回上一个视图
function goBack() {
    if (currentView === 'reader') {
        // 保存阅读进度
        saveReadingProgress();
        
        hideAllViews();
        document.getElementById('mangaListView').style.display = 'block';
        document.getElementById('backBtn').style.display = 'none';
        currentView = 'list';
        currentManga = null;
        currentImages = [];
        currentImageIndex = 0;
    } else if (currentView === 'history' || currentView === 'settings') {
        hideAllViews();
        document.getElementById('mangaListView').style.display = 'block';
        document.getElementById('backBtn').style.display = 'none';
        currentView = 'list';
    }
}

// 加载当前图片
function loadCurrentImage() {
    if (currentImages.length === 0) return;
    
    const imageElement = document.getElementById('mangaImage');
    const imageUrl = `/api/image/${encodeURIComponent(currentManga)}/${encodeURIComponent(currentImages[currentImageIndex])}`;
    
    // 显示加载状态
    imageElement.style.opacity = '0.0';
    
    // 预加载图片
    // const img = new Image();
    updateImageCounter();
    updateCurrentFileName();
    imageElement.onload = function() {
        // imageElement.src = imageUrl;
        imageElement.style.opacity = '1';
        // updateNavigationButtons();
        
        // 智能预加载图片
        preloadImages();
        
        // 保存阅读进度（延迟保存，避免频繁请求）
        clearTimeout(window.saveProgressTimeout);
        window.saveProgressTimeout = setTimeout(saveReadingProgress, 1000);
    };
    imageElement.onerror = function() {
        showError('图片加载失败');
        imageElement.style.opacity = '1';
    };
    imageElement.src = imageUrl;
}

async function reloadCurrentImage() {
    if (currentImages.length === 0) return;
    
    const imageElement = document.getElementById('mangaImage');
    const imageUrl = `/api/image/${encodeURIComponent(currentManga)}/${encodeURIComponent(currentImages[currentImageIndex])}`;
    
    // 显示加载状态
    imageElement.style.opacity = '0.0';
    
    // 预加载图片
    // const img = new Image();
    updateImageCounter();
    updateCurrentFileName();
    await fetch(imageUrl, { cache: "reload" });
    imageElement.onload = function() {
        // imageElement.src = imageUrl;
        imageElement.style.opacity = '1';
        // 智能预加载图片
        preloadImages();
        
        // 保存阅读进度（延迟保存，避免频繁请求）
        clearTimeout(window.saveProgressTimeout);
        window.saveProgressTimeout = setTimeout(saveReadingProgress, 1000);
    };
    imageElement.onerror = function() {
        showError('图片加载失败');
        imageElement.style.opacity = '1';
    };
    imageElement.src = imageUrl;
}


// 智能预加载图片
function preloadImages() {
    const startIndex = Math.max(0, currentImageIndex - Math.floor(preloadBuffer / 2));
    const endIndex = Math.min(currentImages.length - 1, currentImageIndex + Math.ceil(preloadBuffer / 2));
    
    for (let i = startIndex; i <= endIndex; i++) {
        if (i === currentImageIndex) continue; // 跳过当前图片
        
        const imageUrl = `/api/image/${encodeURIComponent(currentManga)}/${encodeURIComponent(currentImages[i])}`;
        
        // 如果图片不在缓存中，则预加载
        if (!imageCache.has(imageUrl)) {
            // const img = new Image();
            fetch(imageUrl).then(() => {
                imageCache.add(imageUrl);
                // 限制缓存大小，避免内存溢出
                while (imageCache.size > preloadBuffer * 3) {
                    const firstKey = imageCache.keys().next().value;
                    imageCache.delete(firstKey);
                }
                updateCacheStatus();
            });
        }
    }
}

// 更新缓冲大小
function updateBufferSize() {
    const select = document.getElementById('preloadBuffer');
    preloadBuffer = parseInt(select.value);
    
    // 清空旧缓存
    imageCache.clear();
    updateCacheStatus();
    
    // 重新预加载
    if (currentImages.length > 0) {
        preloadImages();
    }
}

// 处理图片点击事件
function handleImageClick(event) {
    const container = document.getElementById('imageContainer');
    const rect = container.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const containerWidth = rect.width;
    
    const leftZone = containerWidth / 3;
    const rightZone = containerWidth * 2 / 3;
    
    if (clickX < leftZone) {
        // 左侧区域
        if (readingDirection === 'left_to_right') {
            previousImage();
        } else {
            nextImage();
        }
    } else if (clickX > rightZone) {
        // 右侧区域
        if (readingDirection === 'left_to_right') {
            nextImage();
        } else {
            previousImage();
        }
    } else {
        // 中间区域 - 显示滑动条
        toggleSlider();
    }
}

// 导航到文件夹
function navigateToFolder(path) {
    breadcrumbHistory.push(currentPath);
    loadMangaList(path);
}

// 更新面包屑导航
function updateBreadcrumb() {
    const breadcrumbPath = document.getElementById('breadcrumbPath');
    if (!currentPath) {
        breadcrumbPath.innerHTML = '<span class="breadcrumb-item" onclick="loadMangaList(\'\')">首页</span>';
        return;
    }
    
    const pathParts = currentPath.split(/[/\\]/);
    let fullPath = '';
    let breadcrumbHtml = '<span class="breadcrumb-item" onclick="loadMangaList(\'\')">首页</span>';
    
    pathParts.forEach((part, index) => {
        if (part) {
            fullPath += (fullPath ? '/' : '') + part;
            breadcrumbHtml += '<span class="breadcrumb-separator">></span>';
            if (index === pathParts.length - 1) {
                breadcrumbHtml += `<span class="breadcrumb-item current">${part}</span>`;
            } else {
                breadcrumbHtml += `<span class="breadcrumb-item" onclick="loadMangaList('${fullPath}')">${part}</span>`;
            }
        }
    });
    
    breadcrumbPath.innerHTML = breadcrumbHtml;
}

// 显示历史记录
function showHistory() {
    hideAllViews();
    document.getElementById('historyView').style.display = 'block';
    document.getElementById('backBtn').style.display = 'block';
    currentView = 'history';
    loadHistory();
}

// 显示设置
function showSettings() {
    hideAllViews();
    displaySettings();
    document.getElementById('settingsView').style.display = 'block';
    document.getElementById('backBtn').style.display = 'block';
    currentView = 'settings';
}

// 隐藏所有视图
function hideAllViews() {
    document.getElementById('mangaListView').style.display = 'none';
    document.getElementById('mangaReaderView').style.display = 'none';
    document.getElementById('historyView').style.display = 'none';
    document.getElementById('settingsView').style.display = 'none';
}

// 加载历史记录
async function loadHistory() {
    try {
        const response = await fetch('/api/history');
        const data = await response.json();
        
        if (data.success) {
            displayHistory(data.data);
        } else {
            showError('加载历史记录失败: ' + data.error);
        }
    } catch (error) {
        showError('网络错误: ' + error.message);
    }
}

// 显示历史记录
function displayHistory(history) {
    const historyList = document.getElementById('historyList');
    
    if (history.length === 0) {
        historyList.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #666;">
                📖 暂无阅读历史
            </div>
        `;
        return;
    }
    
    historyList.innerHTML = history.map((item, index) => `
        <div class="history-item" onclick="resumeReading('${item.manga_path}', ${item.image_index})">
            <div class="history-info">
                <h4>${item.chapter_name}</h4>
                <p>路径: ${item.manga_path}</p>
                <p>时间: ${new Date(item.timestamp).toLocaleString()}</p>
            </div>
            <div class="history-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${item.progress_percent}%"></div>
                </div>
                <span>${item.progress_percent}% (${item.image_index + 1}/${item.total_images})</span>
                <button class="delete-btn" onclick="event.stopPropagation(); deleteHistory(${index})">🗑️</button>
            </div>
        </div>
    `).join('');
}

// 恢复阅读
async function resumeReading(mangaPath, imageIndex) {
    try {
        const response = await fetch(`/api/manga/${encodeURIComponent(mangaPath)}`);
        const data = await response.json();
        
        if (data.success) {
            currentManga = mangaPath;
            currentImages = data.data.images;
            currentImageIndex = Math.min(imageIndex, currentImages.length - 1);
            
            if (currentImages.length > 0) {
                showReaderView();
                loadCurrentImage();
            } else {
                showError('该漫画章节中没有图片文件');
            }
        } else {
            showError('加载漫画失败: ' + data.error);
        }
    } catch (error) {
        showError('网络错误: ' + error.message);
    }
}

// 删除历史记录
async function deleteHistory(index) {
    try {
        const response = await fetch(`/api/history/${index}`, { method: 'DELETE' });
        const data = await response.json();
        
        if (data.success) {
            loadHistory(); // 重新加载历史记录
        } else {
            showError('删除失败: ' + data.error);
        }
    } catch (error) {
        showError('网络错误: ' + error.message);
    }
}

// 加载设置
async function loadSettings() {
    try {
        const response = await fetch('/api/config');
        const data = await response.json();
        
        if (data.success) {
            // 设置阅读方向
            readingDirection = data.data.reading_direction || 'left_to_right';
            preloadBuffer = data.data.preload_buffer || 3;
            basePaths = data.data.base_paths || [];
            currentBasePath = data.data.current_base_path || '/';
            currentPath = '';
            loadMangaList('');
        } else {
            showError('加载设置失败: ' + data.error);
        }
    } catch (error) {
        showError('网络错误: ' + error.message);
    }
}
async function saveSettings() {
    const select1 = document.getElementById('readingDirection');
    readingDirection = select1.value;
    const select2 = document.getElementById('preloadBuffer');
    preloadBuffer = parseInt(select2.value);

    
    const updateResponse = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_paths: basePaths,
            reading_direction: readingDirection,
            current_base_path: currentBasePath,
            preload_buffer: preloadBuffer })
    });
}

// 显示设置
function displaySettings() {
    const pathList = document.getElementById('pathList');
    const readingDirectionSelect = document.getElementById('readingDirection');
    
    // 设置阅读方向
    readingDirectionSelect.value = readingDirection;
    
    pathList.innerHTML = basePaths.map(path => `
        <div class="path-item ${path === currentBasePath ? 'active' : ''}">
            <span class="path-text">${path}</span>
            <div class="path-actions">
                ${path !== currentBasePath ? `<button class="select-btn" onclick="selectPath('${path}')">选择</button>` : '<span style="color: #5a67d8; font-weight: bold;">当前</span>'}
                ${basePaths.length > 1 ? `<button class="remove-btn" onclick="removePath('${path}')">删除</button>` : ''}
            </div>
        </div>
    `).join('');
}

// 添加新路径
async function addNewPath() {
    const input = document.getElementById('newPathInput');
    const newPath = input.value.trim();
    
    if (!newPath) {
        showError('请输入有效路径');
        return;
    }
    
    if (basePaths.includes(newPath)) {
        showError('路径已存在');
        return;
    }
    
    basePaths.push(newPath);
    displaySettings(); // 重新加载设置
}

// 选择路径
async function selectPath(path) {
    currentBasePath= path;
    
    displaySettings(); // 重新加载设置
    // 重置路径到根目录
    currentPath = '';
    loadMangaList('');
}

// 删除路径
async function removePath(path) {
    if (!confirm('确定要删除这个路径吗？')) return;
    
    basePaths= basePaths.filter(p => p !== path);
    // 如果删除的是当前路径，切换到第一个可用路径
    if (currentBasePath === path && basePaths.length > 0) {
        currentBasePath = basePaths[0];
        currentPath = '';
        loadMangaList('');
    }
    
    displaySettings(); // 重新加载设置
}

// 保存阅读进度
async function saveReadingProgress() {
    if (!currentManga || !currentImages.length) return;
    
    try {
        await fetch('/api/history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                manga_path: currentManga,
                chapter_name: currentManga.split(/[/\\]/).pop() || currentManga,
                image_index: currentImageIndex,
                total_images: currentImages.length
            })
        });
    } catch (error) {
        console.error('保存阅读进度失败:', error);
    }
}

// 初始化滑动条
function initializeSlider() {
    const imageRange = document.getElementById('imageRange');
    const sliderText = document.getElementById('sliderText');
    
    if (!imageRange || !sliderText) return;
    
    imageRange.max = currentImages.length - 1;
    imageRange.value = currentImageIndex;
    updateSliderText();
    updateCurrentImageName();
    
    // 根据阅读方向设置滑动条方向
    if (readingDirection === 'right_to_left') {
        imageRange.style.direction = 'rtl';
    } else {
        imageRange.style.direction = 'ltr';
    }
    
    // 绑定滑动条事件
    imageRange.oninput = function() {
        let newIndex = parseInt(this.value);
        
        // 如果是从右到左阅读，反转索引
        // if (readingDirection === 'right_to_left') {
        //     newIndex = currentImages.length - 1 - newIndex;
        // }
        
        if (newIndex !== currentImageIndex) {
            currentImageIndex = newIndex;
            loadCurrentImage();
            updateSliderText();
            updateCurrentImageName();
        }
    };
}

// 更新滑动条文本
function updateSliderText() {
    const sliderText = document.getElementById('sliderText');
    if (sliderText) {
        sliderText.textContent = `第 ${currentImageIndex + 1} 页 / 总共 ${currentImages.length} 页`;
    }
}

// 更新当前文件名显示
function updateCurrentFileName() {
    const currentFileName = document.getElementById('currentFileName');
    if (currentFileName && currentImages.length > 0) {
        currentFileName.textContent = currentImages[currentImageIndex];
    }
}

// 更新当前图片名称（在滑动条中）
function updateCurrentImageName() {
    const currentImageName = document.getElementById('currentImageName');
    if (currentImageName && currentImages.length > 0) {
        currentImageName.textContent = currentImages[currentImageIndex];
    }
}

// 显示/隐藏滑动条
function toggleSlider() {
    const imageSlider = document.getElementById('imageSlider');
    const imageRange = document.getElementById('imageRange');
    
    if (imageSlider.style.display === 'none') {
        imageSlider.style.display = 'block';
        
        // 根据阅读方向设置滑动条值
        // if (readingDirection === 'right_to_left') {
        //     imageRange.value = currentImages.length - 1 - currentImageIndex;
        // } else {
        //     imageRange.value = currentImageIndex;
        // }

        imageRange.value = currentImageIndex;
        
        updateSliderText();
        updateCurrentImageName();
        
        // // 8秒后自动隐藏
        // clearTimeout(sliderTimeout);
        // sliderTimeout = setTimeout(() => {
        //     hideSlider();
        // }, 8000);
    } else {
        hideSlider();
    }
}

// 隐藏滑动条
function hideSlider() {
    const imageSlider = document.getElementById('imageSlider');
    imageSlider.style.display = 'none';
    clearTimeout(sliderTimeout);
}

// 显示章节导航
function showChapterNavigation() {
    const chapterNav = document.getElementById('chapterNavigation');
    const nextChapterBtn = document.getElementById('nextChapterBtn');
    
    if (adjacentChapters.next) {
        nextChapterBtn.textContent = `进入下一章: ${adjacentChapters.next.split('/').pop()}`;
        chapterNav.style.display = 'flex';
    }
}

// 隐藏章节导航
function hideChapterNavigation() {
    const chapterNav = document.getElementById('chapterNavigation');
    chapterNav.style.display = 'none';
}

// 前往下一章
async function goToNextChapter() {
    if (adjacentChapters.next) {
        hideChapterNavigation();
        await openManga(adjacentChapters.next);
    }
}

// 更新阅读方向设置
async function updateReadingDirection() {
    const select = document.getElementById('readingDirection');
    readingDirection = select.value;
    
    // 如果当前在阅读视图，重新初始化滑动条
    if (currentView === 'reader' && currentImages.length > 0) {
        initializeSlider();
    }
    
}

// 上一页
function previousImage() {
    if (currentImageIndex > 0) {
        currentImageIndex--;
        loadCurrentImage();
        updateSlider();
    } else if (adjacentChapters.previous) {
        // 已到达第一页，询问是否进入上一章
        if (confirm(`已到达本章开始，是否进入上一章: ${adjacentChapters.previous.split('/').pop()}？`)) {
            openManga(adjacentChapters.previous).then(() => {
                // 跳转到上一章的最后一页
                currentImageIndex = currentImages.length - 1;
                loadCurrentImage();
                updateSlider();
            });
        }
    }
}

// 下一页
function nextImage() {
    if (currentImageIndex < currentImages.length - 1) {
        currentImageIndex++;
        loadCurrentImage();
        updateSlider();
    } else if (adjacentChapters.next) {
        // 已到达最后一页，显示章节导航
        showChapterNavigation();
    }
}

// 更新滑动条位置
function updateSlider() {
    const imageRange = document.getElementById('imageRange');
    if (imageRange) {
        // 根据阅读方向设置滑动条值
        // if (readingDirection === 'right_to_left') {
        //     imageRange.value = currentImages.length - 1 - currentImageIndex;
        // } else {
        //     imageRange.value = currentImageIndex;
        // }
        imageRange.value = currentImageIndex;
        updateSliderText();
        updateCurrentImageName();
    }
}

// // 更新导航按钮状态
// function updateNavigationButtons() {
//     const prevButtons = document.querySelectorAll('button[onclick="previousImage()"]');
//     const nextButtons = document.querySelectorAll('button[onclick="nextImage()"]');
    
//     prevButtons.forEach(btn => {
//         btn.disabled = currentImageIndex === 0;
//     });
    
//     nextButtons.forEach(btn => {
//         btn.disabled = currentImageIndex === currentImages.length - 1;
//     });
// }

// 更新图片计数器
function updateImageCounter() {
    const counter = document.getElementById('imageCounter');
    counter.textContent = `${currentImageIndex + 1} / ${currentImages.length}`;
}

// 更新缓存状态
function updateCacheStatus() {
    const cacheStatus = document.getElementById('cacheStatus');
    if (cacheStatus) {
        cacheStatus.textContent = `缓存: ${imageCache.size}`;
    }
}

// 显示/隐藏列表加载状态
function showLoadingList(show) {
    document.getElementById('loadingList').style.display = show ? 'block' : 'none';
    document.getElementById('mangaGrid').style.display = show ? 'none' : 'grid';
}

// 显示/隐藏阅读器加载状态
// function showLoadingReader(show) {
//     document.getElementById('loadingReader').style.display = show ? 'block' : 'none';
//     document.getElementById('imageContainer').style.display = show ? 'none' : 'block';
// }

// 显示错误信息
function showError(message) {
    alert('错误: ' + message);
}

// 键盘快捷键
document.addEventListener('keydown', function(event) {
    if (document.getElementById('mangaReaderView').style.display !== 'none') {
        // 检查是否有滑动条显示
        const imageSlider = document.getElementById('imageSlider');
        const chapterNav = document.getElementById('chapterNavigation');
        
        if (imageSlider.style.display !== 'none') {
            if (event.key === 'Escape') {
                event.preventDefault();
                hideSlider();
            }
            return;
        }
        
        if (chapterNav.style.display !== 'none') {
            if (event.key === 'Escape') {
                event.preventDefault();
                hideChapterNavigation();
            } else if (event.key === 'Enter') {
                event.preventDefault();
                goToNextChapter();
            }
            return;
        }
        
        switch(event.key) {
            case 'ArrowLeft':
            case 'a':
            case 'A':
                event.preventDefault();
                if (readingDirection === 'left_to_right') {
                    previousImage();
                } else {
                    nextImage();
                }
                break;
            case 'ArrowRight':
            case 'd':
            case 'D':
                event.preventDefault();
                if (readingDirection === 'left_to_right') {
                    nextImage();
                } else {
                    previousImage();
                }
                break;
            case 'ArrowUp':
            case 'w':
            case 'W':
                event.preventDefault();
                previousImage();
                break;
            case 'ArrowDown':
            case 's':
            case 'S':
                event.preventDefault();
                nextImage();
                break;
            case ' ':
                event.preventDefault();
                toggleSlider();
                break;
            case 'Escape':
                event.preventDefault();
                goBack();
                break;
        }
    }
});

// 触摸手势支持（移动端）
let touchStartX = 0;
let touchEndX = 0;

document.addEventListener('touchstart', function(event) {
    touchStartX = event.changedTouches[0].screenX;
});

document.addEventListener('touchend', function(event) {
    touchEndX = event.changedTouches[0].screenX;
    handleSwipe();
});

function handleSwipe() {
    const swipeThreshold = 50;
    const swipeDistance = touchEndX - touchStartX;
    
    if (document.getElementById('mangaReaderView').style.display !== 'none') {
        // 检查是否有弹窗显示
        const imageSlider = document.getElementById('imageSlider');
        const chapterNav = document.getElementById('chapterNavigation');
        
        if (imageSlider.style.display !== 'none' || chapterNav.style.display !== 'none') {
            return;
        }
        
        if (swipeDistance > swipeThreshold) {
            // 向右滑动
            if (readingDirection === 'left_to_right') {
                previousImage();
            } else {
                nextImage();
            }
        } else if (swipeDistance < -swipeThreshold) {
            // 向左滑动
            if (readingDirection === 'left_to_right') {
                nextImage();
            } else {
                previousImage();
            }
        }
    }
}
loadSettings()