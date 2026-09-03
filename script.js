// === НАСТРОЙКИ И БАЗОВЫЕ ПЕРЕМЕННЫЕ ===
const canvas = document.getElementById('roomCanvas');
const ctx = canvas.getContext('2d');
let scaleFactor = 20; // 1 метр = 20 пикселей

// Режимы работы
let currentTool = 'draw-room'; // draw-room | select-wall | place-object
let placingObjectType = null; // door | window

// Данные комнаты
let roomPoints = []; // Массив координат углов {x, y} в метрах
let walls = []; // Стены после замыкания контура
let objectsOnWalls = []; // Окна и двери [{type, wallIndex, offset}]

// Материалы из каталога
const materialsCatalog = [
    { id: 'laminate', name: 'Ламинат', unit: 'м²', pricePerUnit: 1200, wastePercent: 8 },
    { id: 'wallpaper', name: 'Обои', unit: 'рулон', rollWidth: 1.06, rollLength: 10, pricePerUnit: 1500, wastePercent: 10 },
    { id: 'tile', name: 'Плитка', unit: 'м²', pricePerUnit: 2500, wastePercent: 10 }
];
let selectedMaterial = materialsCatalog[0]; // По умолчанию ламинат

// Элементы DOM для вывода данных
const outputArea = document.getElementById('outputArea');
const lengthInput = document.getElementById('lengthInput');
const widthInput = document.getElementById('widthInput');
const btnDrawRoom = document.getElementById('btnDrawRoom');

// === ГЛАВНАЯ ЛОГИКА РИСОВАНИЯ ===

function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function redrawScene() {
    clearCanvas();
    
    // Рисуем стены
    if (walls.length > 0) {
        ctx.strokeStyle = '#374151';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(walls[0].start.x * scaleFactor, walls[0].start.y * scaleFactor);
        for (let wall of walls) {
            ctx.lineTo(wall.end.x * scaleFactor, wall.end.y * scaleFactor);
        }
        ctx.closePath();
        ctx.stroke();
        
        // Заливка пола светло-серым
        ctx.fillStyle = '#f9fafb';
        ctx.fill();
    }

    // Рисуем окна и двери
    objectsOnWalls.forEach(obj => {
        const wall = walls[obj.wallIndex];
        const posX = wall.start.x + (wall.end.x - wall.start.x) * obj.offset;
        const posY = wall.start.y + (wall.end.y - wall.start.y) * obj.offset;
        
        ctx.save();
        // Вычисляем угол наклона стены для поворота объекта
        const angle = Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);
        ctx.translate(posX * scaleFactor, posY * scaleFactor);
        ctx.rotate(angle);
        
        if (obj.type === 'door') {
            ctx.fillStyle = '#dc2626';
            ctx.fillRect(-20 * scaleFactor / 100, -50 * scaleFactor / 100, 40 * scaleFactor / 100, 100 * scaleFactor / 100); // Дверное полотно
        } else if (obj.type === 'window') {
            ctx.fillStyle = '#add8e6';
            ctx.fillRect(-60 * scaleFactor / 100, -50 * scaleFactor / 100, 120 * scaleFactor / 100, 100 * scaleFactor / 100); // Оконная рама
        }
        ctx.restore();
    });
}

// Конвертация клика мыши в координаты метры->пиксели
function getMousePos(evt) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = evt.clientX - rect.left;
    const mouseY = evt.clientY - rect.top;
    return { x: mouseX / scaleFactor, y: mouseY / scaleFactor };
}

// Клик по холсту
canvas.addEventListener('click', (e) => {
    const pos = getMousePos(e);
    
    if (currentTool === 'draw-room') {
        roomPoints.push({ x: parseFloat(pos.x.toFixed(2)), y: parseFloat(pos.y.toFixed(2)) });
        if (roomPoints.length > 1) {
            // Визуальная линия от последней точки к текущей
            ctx.strokeStyle = '#9ca3af';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            const last = roomPoints[roomPoints.length - 2];
            ctx.moveTo(last.x * scaleFactor, last.y * scaleFactor);
            ctx.lineTo(pos.x * scaleFactor, pos.y * scaleFactor);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }
});

// Замыкание комнаты и генерация стен
btnDrawRoom.addEventListener('click', () => {
    if (roomPoints.length < 3) {
        alert('Нужно минимум 3 точки для комнаты');
        return;
    }
    
    // Замыкаем контур
    walls = [];
    for (let i = 0; i < roomPoints.length; i++) {
        const start = roomPoints[i];
        const end = roomPoints[(i + 1) % roomPoints.length];
        walls.push({ start, end, length: distance(start, end) });
    }
    
    // Сохраняем проект в localStorage
    saveProject();
    
    renderOutput();
    redrawScene();
});

// Вспомогательная функция расстояния
function distance(a, b) {
    return Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
}

// === ЛОГИКА СМЕТЫ И МАТЕРИАЛОВ ===

function calculateAreas() {
    let floorArea = 0;
    let perimeter = 0;
    let wallGrossArea = 0;
    
    if (walls.length === 0) return { floorArea: 0, wallArea: 0 };
    
    // Площадь пола (формула Гаусса)
    for (let i = 0; i < roomPoints.length; i++) {
        const j = (i + 1) % roomPoints.length;
        floorArea += roomPoints[i].x * roomPoints[j].y;
        floorArea -= roomPoints[j].x * roomPoints[i].y;
    }
    floorArea = Math.abs(floorArea / 2);
    
    // Периметр и площадь стен
    const avgHeight = 2.7; // Стандартная высота потолка
    walls.forEach(w => {
        perimeter += w.length;
        wallGrossArea += w.length * avgHeight;
    });
    
    // Вычитаем окна и двери (примерные размеры)
    const windowArea = 1.5 * 1.2; // 1.8 м2
    const doorArea = 0.8 * 2.0; // 1.6 м2
    const openingsTotal = objectsOnWalls.length * ((objectsOnWalls[0]?.type === 'window') ? windowArea : doorArea);
    
    const netWallArea = Math.max(0, wallGrossArea - openingsTotal);
    
    return { floorArea, wallArea: netWallArea, perimeter };
}

function calculateMaterials(areaData) {
    const results = {};
    
    if (selectedMaterial.id === 'laminate' || selectedMaterial.id === 'tile') {
        const pureArea = selectedMaterial.id === 'laminate' ? areaData.floorArea : areaData.wallArea;
        const totalAreaWithWaste = pureArea * (1 + selectedMaterial.wastePercent / 100);
        const packsNeeded = Math.ceil(totalAreaWithWaste / 2.2); // Упаковка 2.2 м2
        
        results.count = packsNeeded;
        results.packSize = '2.2 м²';
        results.totalPrice = (packsNeeded * selectedMaterial.pricePerUnit * 2.2).toFixed(2);
        
    } else if (selectedMaterial.id === 'wallpaper') {
        const wallAreaNoOpenings = areaData.wallArea;
        const usableRollArea = selectedMaterial.rollWidth * selectedMaterial.rollLength * (1 - 0.15); // На обрезку рисунка
        const rollsNeeded = Math.ceil(wallAreaNoOpenings / usableRollArea);
        
        results.count = rollsNeeded;
        results.packSize = `${selectedMaterial.rollLength} м`;
        results.totalPrice = (rollsNeeded * selectedMaterial.pricePerUnit).toFixed(2);
    }
    return results;
}

function renderOutput() {
    const data = calculateAreas();
    const matData = calculateMaterials(data);
    
    outputArea.innerHTML = `
        <div class="total-row"><span>Площадь пола:</span><strong>${data.floorArea.toFixed(2)} м²</strong></div>
        <div class="total-row"><span>Площадь стен (нетто):</span><strong>${data.wallArea.toFixed(2)} м²</strong></div>
        <div class="total-row"><span>Периметр:</span><strong>${data.perimeter.toFixed(2)} м</strong></div>
        <hr>
        <div class="material-header">Материал: ${selectedMaterial.name}</div>
        <div class="total-row"><span>Количество:</span><strong>${matData.count} ${matData.packSize}</strong></div>
        <div class="total-row grand-total"><span>Итоговая сумма:</span><strong>${matData.totalPrice} ₽</strong></div>
    `;
}

// === УПРАВЛЕНИЕ ИНТЕРФЕЙСОМ ===

document.querySelectorAll('.material-item').forEach(item => {
    item.addEventListener('click', () => {
        document.querySelectorAll('.material-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
        const id = item.dataset.id;
        selectedMaterial = materialsCatalog.find(m => m.id === id);
        if (walls.length > 0) renderOutput();
    });
});

// Кнопки инструментов
document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTool = btn.dataset.tool;
        placingObjectType = btn.dataset.obj;
    });
});

// Загрузка сохраненного проекта при старте
loadProject();
renderOutput();
redrawScene();

// === СОХРАНЕНИЕ В БРАУЗЕР ===
function saveProject() {
    const project = { points: roomPoints, walls, objects: objectsOnWalls };
    localStorage.setItem('smeta-project', JSON.stringify(project));
}

function loadProject() {
    const saved = localStorage.getItem('smeta-project');
    if (saved) {
        const p = JSON.parse(saved);
        roomPoints = p.points;
        walls = p.walls;
        objectsOnWalls = p.objects;
    }
}
