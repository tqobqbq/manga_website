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
let currentSort = { sortBy: 'name', sortOrder: 'asc' }; // 排序设置
let currentMangaData = []; // 存储原始数据，用于前端排序
let readingHistory = []; // 阅读历史数据

let epubRendition = null;
let epubBook = null;
let epubDirection = 'ltr';

// 前端排序函数
function sortItems(items, sortBy, sortOrder) {
    const sortedItems = [...items]; // 创建副本
    
    if (sortBy === 'date') {
        sortedItems.sort((a, b) => {
            const dateA = new Date(a.modified_time);
            const dateB = new Date(b.modified_time);
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });
    } else { // 按名称排序
        sortedItems.sort((a, b) => {
            const nameA = a.name.toLowerCase();
            const nameB = b.name.toLowerCase();
            if (sortOrder === 'asc') {
                return nameA.localeCompare(nameB);
            } else {
                return nameB.localeCompare(nameA);
            }
        });
        
        // 文件夹优先显示（除非明确按日期排序）
        if (sortBy === 'name') {
            const folders = sortedItems.filter(item => item.type === 'folder');
            const files = sortedItems.filter(item => item.type !== 'folder');
            return [...folders, ...files];
        }
    }
    
    return sortedItems;
}

// 初始化应用
document.addEventListener('DOMContentLoaded', function() {
    // loadMangaList();
    updateBreadcrumb();
});

// 加载漫画列表
async function loadMangaList(path = currentPath) {
    try {
        showLoadingList(true);
        let url = `/api/manga`;
        
        if (path) {
            url += '?path=' + encodeURIComponent(path);
        }
        
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
function displayMangaList(data) {
    const mangaGrid = document.getElementById('mangaGrid');
    
    // 存储原始数据
    currentMangaData = data.items || data || [];
    
    // 创建排序控件
    const sortControls = document.createElement('div');
    sortControls.className = 'sort-controls';
    sortControls.innerHTML = `
        <label for="sortBy">排序方式:</label>
        <select id="sortBy">
            <option value="name">文件名</option>
            <option value="date">修改日期</option>
        </select>
        
        <label for="sortOrder">排序顺序:</label>
        <select id="sortOrder">
            <option value="asc">升序</option>
            <option value="desc">降序</option>
        </select>
        
        <button class="refresh-btn" onclick="loadMangaList()">刷新</button>
    `;
    
    // 设置当前排序值
    sortControls.querySelector('#sortBy').value = currentSort.sortBy;
    sortControls.querySelector('#sortOrder').value = currentSort.sortOrder;
    
    // 添加排序change事件 - 直接重新渲染，不重新加载数据
    sortControls.querySelector('#sortBy').addEventListener('change', (e) => {
        currentSort.sortBy = e.target.value;
        renderMangaItems();
    });
    
    sortControls.querySelector('#sortOrder').addEventListener('change', (e) => {
        currentSort.sortOrder = e.target.value;
        renderMangaItems();
    });
    
    // 清空网格并添加排序控件
    mangaGrid.innerHTML = '';
    mangaGrid.appendChild(sortControls);
    
    // 渲染漫画项目
    renderMangaItems();
}

// 渲染漫画项目列表
function renderMangaItems() {
    const mangaGrid = document.getElementById('mangaGrid');
    
    // 查找或创建items容器
    let itemsContainer = mangaGrid.querySelector('.manga-grid');
    if (!itemsContainer) {
        itemsContainer = document.createElement('div');
        itemsContainer.className = 'manga-grid';
        mangaGrid.appendChild(itemsContainer);
    }
    
    // 清空容器
    itemsContainer.innerHTML = '';
    
    if (currentMangaData.length === 0) {
        itemsContainer.innerHTML = `
            <div class="manga-card" style="text-align: center; cursor: default;">
                <div class="item-icon">📚</div>
                <div class="item-content">
                    <div class="item-name">暂无内容</div>
                    <div class="item-info">该文件夹为空或无法访问</div>
                </div>
            </div>
        `;
        return;
    }
    
    // 排序数据
    const sortedItems = sortItems(currentMangaData, currentSort.sortBy, currentSort.sortOrder);
    
    let img_count=0;
    // 渲染每个项目
    sortedItems.forEach(item => {
        const isFolder = item.type === 'folder';
        const isEpub = item.type === 'epub';
        const isImage = item.type === 'image';
        
        const itemDiv = document.createElement('div');
        itemDiv.className = `manga-card ${isFolder ? 'folder' : (isEpub ? 'epub' : 'file')}`;
        
        // 格式化修改时间
        let modifiedDate = '';
        if (item.modified_time) {
            modifiedDate = new Date(item.modified_time).toLocaleString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        }
        
        // 格式化文件大小
        let sizeInfo = '';
        if (!isFolder && item.size !== undefined) {
            if (item.size < 1024) {
                sizeInfo = `${item.size} B`;
            } else if (item.size < 1024 * 1024) {
                sizeInfo = `${(item.size / 1024).toFixed(1)} KB`;
            } else if (item.size < 1024 * 1024 * 1024) {
                sizeInfo = `${(item.size / 1024 / 1024).toFixed(1)} MB`;
            } else {
                sizeInfo = `${(item.size / 1024 / 1024 / 1024).toFixed(1)} GB`;
            }
        }
        
        let icon = '📄';
        if (isFolder) icon = '📁';
        else if (isEpub) icon = '📕';
        else if (isImage) icon = '🖼️';
        
        itemDiv.innerHTML = `
            <div class="item-icon ${isFolder ? 'folder' : (isEpub ? 'epub' : 'file')}">
                ${icon}
            </div>
            <div class="item-content">
                <div class="item-name">${item.name}</div>
                <div class="item-info">
                    ${modifiedDate ? `<span class="item-date">修改: ${modifiedDate}</span>` : ''}
                    ${sizeInfo ? `<span class="item-size">大小: ${sizeInfo}</span>` : ''}
                </div>
            </div>
        `;
        
        if (isFolder) {
            // 点击文件夹，进入文件夹
            const newPath = currentPath ? `${currentPath}/${item.name}` : item.name;
            itemDiv.setAttribute('onclick',`navigateToFolder('${newPath}')`);
        } else if (isImage) {
            // 点击图片文件，进入看漫画模式
            const imagePath = currentPath ? currentPath : '';
            itemDiv.setAttribute('onclick',`openManga('${imagePath}',${img_count})`);
            img_count+=1;
        } else if (isEpub) {
            // 点击epub文件，进入epub阅读模式
            const epubPath = currentPath ? `${currentPath}/${item.name}` : item.name;
            itemDiv.setAttribute('onclick',`openEpub('${epubPath}')`);
        }

        itemsContainer.appendChild(itemDiv);
    });
}

// 打开漫画章节
async function openManga(mangaPath,index) {
    try {
        // showLoadingReader(true);
        console.log(`Opening manga: ${mangaPath}`);
        const response = await fetch(`/api/manga/${encodeURIComponent(mangaPath)}`);
        const data = await response.json();
        
        if (data.success) {
            currentPath=mangaPath;
            currentManga = mangaPath;
            currentImages = data.data.images;
            adjacentChapters = data.data.adjacent_chapters || { previous: null, next: null };
            currentImageIndex = index;
            updateBreadcrumb();
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
    // hideAllViews();
    // document.getElementById('readerView').style.display = 'block';
    // currentView = 'reader';
    showOneView('reader');
    document.getElementById('mainHeader').style.display = 'none';
    document.getElementById('breadcrumbPath2').style.display = 'none';
    imageContainer.style.position = 'fixed';
    document.getElementById('currentMangaName').textContent = currentManga.split(/[/\\]/).pop() || currentManga;
    updateImageCounter();
    updateCurrentFileName();
}

// 返回上一个视图
function goBack() {
    if (currentView === 'reader') {
        // 保存阅读进度
        saveReadingProgress();
        
        hideAllViews();
        document.getElementById('listView').style.display = 'block';
        currentView = 'list';
        currentManga = null;
        currentImages = [];
        currentImageIndex = 0;
    } else if (currentView === 'history' || currentView === 'settings' || currentView === 'epub') {
        hideAllViews();
        document.getElementById('listView').style.display = 'block';
        currentView = 'list';
        if (currentView === 'epub') {
            if (epubBook) {
                epubBook.destroy();
                epubBook = null;
                epubRendition = null;
            }
        }
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
            // if (index === pathParts.length - 1) {
            //     breadcrumbHtml += `<span class="breadcrumb-item current">${part}</span>`;
            // } else {
            //     breadcrumbHtml += `<span class="breadcrumb-item" onclick="loadMangaList('${fullPath}')">${part}</span>`;
            // }
            breadcrumbHtml += `<span class="breadcrumb-item" onclick="loadMangaList('${fullPath}')">${part}</span>`;
        }
    });
    
    breadcrumbPath.innerHTML = breadcrumbHtml;
}

// 显示历史记录
function showHistory() {
    showOneView('history');
    loadHistory();
}

// 显示设置
function showSettings() {
    showOneView('settings');
    displaySettings();
}

function showOneView(viewName) {
    hideAllViews();
    document.getElementById(viewName+'View').style.display = 'block';
    currentView = viewName;
    document.getElementById('mainHeader').style.display = 'block';
    document.getElementById('breadcrumbPath2').style.display = 'block';
    imageContainer.style.position = 'static';
}

// 隐藏所有视图
function hideAllViews() {
    document.getElementById('listView').style.display = 'none';
    document.getElementById('readerView').style.display = 'none';
    document.getElementById('historyView').style.display = 'none';
    document.getElementById('settingsView').style.display = 'none';
    document.getElementById("readerHeaderView").style.display = 'none';
    document.getElementById("imageSlider").style.display = 'none';
    document.getElementById('epubView').style.display = 'none';
    
    // 移除EPUB键盘监听
    document.removeEventListener('keydown', handleEpubKeydown);
}

// 加载历史记录
async function loadHistory() {
    try {
        const response = await fetch('/api/history');
        const data = await response.json();
        
        if (data.success) {
            readingHistory = data.data;
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
    
    historyList.innerHTML = history.map((item, index) => {
        const isEpub = item.is_epub;
        const progressText = isEpub 
            ? `${item.progress_percent}%` 
            : `${item.progress_percent}% (${item.image_index + 1}/${item.total_images})`;
            
        const clickAction = isEpub
            ? `openEpub('${item.manga_path}')`
            : `openManga('${item.manga_path}', ${item.image_index})`;

        return `
        <div class="history-item" onclick="${clickAction}">
            <div class="history-info">
                <h4>${item.chapter_name}</h4>
                <p>路径: ${item.manga_path}</p>
                <p>时间: ${new Date(item.timestamp).toLocaleString()}</p>
            </div>
            <div class="history-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${item.progress_percent}%"></div>
                </div>
                <span>${progressText}</span>
                <button class="delete-btn" onclick="event.stopPropagation(); deleteHistory(${index})">🗑️</button>
            </div>
        </div>
    `}).join('');
}

// 恢复阅读
// async function resumeReading(mangaPath, imageIndex) {
//     try {
//         const response = await fetch(`/api/manga/${encodeURIComponent(mangaPath)}`);
//         const data = await response.json();
        
//         if (data.success) {
//             currentManga = mangaPath;
//             currentImages = data.data.images;
//             currentImageIndex = Math.min(imageIndex, currentImages.length - 1);
            
//             if (currentImages.length > 0) {
//                 showReaderView();
//                 loadCurrentImage();
//             } else {
//                 showError('该漫画章节中没有图片文件');
//             }
//         } else {
//             showError('加载漫画失败: ' + data.error);
//         }
//     } catch (error) {
//         showError('网络错误: ' + error.message);
//     }
// }

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
        body: JSON.stringify({
            reading_direction: readingDirection,
            preload_buffer: preloadBuffer
        })
    });
}

// 显示设置
function displaySettings() {
    
    // 设置阅读方向
    document.getElementById('readingDirection').value = readingDirection;
    document.getElementById('preloadBuffer').value = preloadBuffer;

    displayPathSettings();
}


function displayPathSettings() {
    
    document.getElementById('pathList').innerHTML = basePaths.map(path => `
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
    displayPathSettings(); // 重新加载设置
}

// 选择路径
async function selectPath(path) {
    currentBasePath= path;
    currentPath = '';
    const updateResponse = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            base_paths: basePaths,
            current_base_path: currentBasePath,
        })
    });
    
    displayPathSettings(); // 重新加载设置
    // 重置路径到根目录
    loadMangaList('');
}

// 删除路径
async function removePath(path) {
    if (!confirm('确定要删除这个路径吗？')) return;
    
    basePaths= basePaths.filter(p => p !== path);
    // 如果删除的是当前路径，切换到第一个可用路径
    if (currentBasePath === path && basePaths.length > 0) {
        selectPath(basePaths[0]);
    }
    else{
        const updateResponse = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                base_paths: basePaths
            })
        });
        displayPathSettings(); // 重新加载设置
    }
    
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
        document.getElementById('mainHeader').style.display = 'block';
        document.getElementById('breadcrumbPath2').style.display = 'block';
        document.getElementById("readerHeaderView").style.display = 'block';
        imageContainer.style.position = 'static';
        
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
    document.getElementById('mainHeader').style.display = 'none';
    document.getElementById('breadcrumbPath2').style.display = 'none';
    document.getElementById("readerHeaderView").style.display = 'none';
    imageContainer.style.position = 'fixed';
    
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
        await openManga(adjacentChapters.next,0);
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
            openManga(adjacentChapters.previous,0).then(() => {
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
    showOneView('list');
    document.getElementById('mangaGrid').style.display = show ? 'none' : 'grid';
}


// 显示错误信息
function showError(message) {
    alert('错误: ' + message);
}

// 键盘快捷键
document.addEventListener('keydown', function(event) {
    if (document.getElementById('readerView').style.display !== 'none') {
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
    } else if (document.getElementById('epubView').style.display !== 'none') {
        // EPUB视图的快捷键
        switch(event.key) {
            case 'ArrowLeft':
                event.preventDefault();
                prevEpubPage();
                break;
            case 'ArrowRight':
                event.preventDefault();
                nextEpubPage();
                break;
        }
    }
});

// 触摸手势支持（移动端）
let touchStartX = 0;
let touchEndX = 0;

// document.getElementById('mangaImage').addEventListener('touchstart', function(event) {
//     touchStartX = event.changedTouches[0].screenX;
// });

// document.getElementById('mangaImage').addEventListener('touchend', function(event) {
//     touchEndX = event.changedTouches[0].screenX;
//     handleSwipe();
// });

function handleSwipe() {
    const swipeThreshold = 50;
    const swipeDistance = touchEndX - touchStartX;
    
    if (document.getElementById('readerView').style.display !== 'none') {
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

// 打开EPUB
function openEpub(epubPath) {
    showOneView('epub');
    document.getElementById('mainHeader').style.display = 'none';
    document.getElementById('breadcrumbPath2').style.display = 'none';
    document.getElementById('epubTitle').textContent = epubPath.split('/').pop();
    
    // 优化布局：全屏，隐藏头部
    const area = document.getElementById('epubArea');
    area.innerHTML = '';
    area.style.marginTop = '0';
    area.style.height = '100vh';
    area.style.width = '100vw';
    area.style.overflow = 'hidden'; // 防止外层滚动
    
    const epubHeader = document.getElementById('epubHeader');
    epubHeader.style.display = 'none'; // 默认隐藏头部
    
    // 使用epub.js加载
    const url = `/api/epub/${encodeURIComponent(epubPath)}`;
    epubBook = ePub(url);
    
    epubRendition = epubBook.renderTo("epubArea", {
        width: "100%",
        height: "100%",
        flow: "paginated",
        manager: "default",
        allowScriptedContent: true
    });
    
    // 修复竖排显示问题：强制设置高度和溢出
    epubRendition.themes.default({
        "html": { "height": "100%" },
        "body": { "height": "100%", "overflow": "hidden" }
    });

    // 注册钩子来动态修复竖排书籍的显示问题
    epubRendition.hooks.content.register(function(contents) {
        const win = contents.window;
        const body = contents.document.body;
        
        if (win && body) {
            const style = win.getComputedStyle(body);
            // 检测是否为竖排模式 (vertical-rl 或 vertical-lr)
            if (style.writingMode && style.writingMode.includes('vertical')) {
                console.log('Detected vertical writing mode, fixing direction...');
                // 强制将文本流方向设为 ltr (从上到下)，修正因 direction: rtl 导致的文字倒排(从下到上)问题
                body.style.direction = 'ltr';
                
                // 额外修正：确保段落也继承正确的方向
                const paragraphs = body.getElementsByTagName('p');
                for (let p of paragraphs) {
                    p.style.direction = 'ltr';
                }
            }
        }
    });
    
    epubRendition.display();
    
    // 获取书籍方向
    epubBook.ready.then(() => {
        const metadata = epubBook.package.metadata;
        epubDirection = metadata.direction || 'ltr';
        console.log('EPUB Direction:', epubDirection);
        
        // 生成 locations 以便获取进度百分比 (这可能会花一点时间)
        epubBook.locations.generate(1000);
    });
    
    // 注册点击事件
    epubRendition.on("click", (e) => {
        const width = window.innerWidth;
        const x = e.clientX;
        
        // 中间区域显示菜单 (30% - 70%)
        if (x > width * 0.3 && x < width * 0.7) {
            if (epubHeader.style.display === 'none') {
                epubHeader.style.display = 'flex';
            } else {
                epubHeader.style.display = 'none';
            }
            return;
        }
        
        // 左右区域翻页
        if (epubDirection === 'rtl') {
            // RTL模式：左侧是下一页，右侧是上一页
            if (x < width * 0.3) {
                nextEpubPage();
            } else {
                prevEpubPage();
            }
        } else {
            // LTR模式：左侧是上一页，右侧是下一页
            if (x < width * 0.3) {
                prevEpubPage();
            } else {
                nextEpubPage();
            }
        }
    });
    
    // 键盘控制
    document.addEventListener('keydown', handleEpubKeydown);

    // 监听位置变化，保存进度
    epubRendition.on('relocated', function(location) {
        saveEpubProgress(epubPath, location);
    });

    // 恢复阅读进度
    // 确保历史记录已加载
    if (readingHistory.length === 0) {
        fetch('/api/history').then(res => res.json()).then(data => {
            if (data.success) {
                readingHistory = data.data;
                restoreEpubProgress(epubPath);
            }
        });
    } else {
        restoreEpubProgress(epubPath);
    }
}

function restoreEpubProgress(epubPath) {
    const historyItem = readingHistory.find(item => item.manga_path === epubPath || item.manga_path.endsWith(epubPath));
    if (historyItem && historyItem.epub_cfi) {
        console.log('Restoring EPUB progress:', historyItem.epub_cfi);
        epubRendition.display(historyItem.epub_cfi);
    } else {
        epubRendition.display();
    }
}

// 保存EPUB阅读进度
function saveEpubProgress(epubPath, location) {
    if (!location || !location.start) return;
    
    // 避免频繁保存
    clearTimeout(window.saveEpubTimeout);
    window.saveEpubTimeout = setTimeout(async () => {
        try {
            // 获取进度百分比
            // 注意：epub.js 的 locations 需要先 generate 才能获取准确百分比，
            // 这里我们简单使用 location.start.percentage 如果可用，或者不传
            // 为了获取准确百分比，通常需要 epubBook.locations.generate()，但这很耗时
            // 我们这里暂时只保存 CFI
            
            const cfi = location.start.cfi;
            // 尝试获取百分比，如果没有则为0
            // 只有当 locations 生成后，percentage 才有意义
            // 我们可以尝试估算，或者如果 epub.js 提供了就用
            let percentage = 0;
            if (epubBook.locations.length() > 0) {
                 percentage = epubBook.locations.percentageFromCfi(cfi) * 100;
            }
            
            await fetch('/api/history', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    manga_path: epubPath,
                    chapter_name: epubPath.split(/[/\\]/).pop(),
                    image_index: percentage, // 使用 image_index 存储百分比
                    total_images: 100,
                    is_epub: true,
                    epub_cfi: cfi
                })
            });
        } catch (error) {
            console.error('保存EPUB进度失败:', error);
        }
    }, 1000);
}

// 监听窗口大小变化，调整EPUB显示
window.addEventListener('resize', () => {
    if (currentView === 'epub' && epubRendition) {
        epubRendition.resize();
    }
});

function prevEpubPage() {
    if (epubRendition) epubRendition.prev();
}

function nextEpubPage() {
    if (epubRendition) epubRendition.next();
}

function handleEpubKeydown(e) {
    if (currentView !== 'epub') return;
    
    if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (epubDirection === 'rtl') {
            nextEpubPage();
        } else {
            prevEpubPage();
        }
    } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (epubDirection === 'rtl') {
            prevEpubPage();
        } else {
            nextEpubPage();
        }
    } else if (e.key === 'Escape') {
        goBack();
    }
}

loadSettings()