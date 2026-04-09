import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Ruler, 
  Download, 
  ImagePlus, 
  Undo, 
  Trash2, 
  Info, 
  Check, 
  X, 
  Move,
  MousePointer2,
  Type,
  Settings2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---
interface Point {
  x: number;
  y: number;
}

interface Dimension {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  value: string;
  unit: 'cm' | 'in';
  color: string;
  width: number;
  textOffsetX: number;
  textOffsetY: number;
  _textHitbox?: { x: number; y: number; r: number };
}

type Part = 'start' | 'end' | 'line' | 'text' | null;

export default function App() {
  // --- State ---
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [currentUnit, setCurrentUnit] = useState<'cm' | 'in'>('cm');
  const [currentColor, setCurrentColor] = useState('#3b82f6');
  const [currentWidth, setCurrentWidth] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tempLine, setTempLine] = useState<{ start: Point; end: Point } | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState(-1);
  const [hoveredPart, setHoveredPart] = useState<Part>(null);
  const [draggingIndex, setDraggingIndex] = useState(-1);
  const [draggingPart, setDraggingPart] = useState<Part>(null);
  const [lastMousePos, setLastMousePos] = useState<Point>({ x: 0, y: 0 });
  const [showInput, setShowInput] = useState<{ x: number; y: number } | null>(null);
  const [inputValue, setInputValue] = useState('');

  // --- Refs ---
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Helpers ---
  const getMousePos = useCallback((e: React.MouseEvent | MouseEvent): Point => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  }, []);

  const distPointToSegment = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
    const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;
    let xx, yy;
    if (param < 0) { xx = x1; yy = y1; }
    else if (param > 1) { xx = x2; yy = y2; }
    else { xx = x1 + param * C; yy = y1 + param * D; }
    return Math.hypot(px - xx, py - yy);
  };

  // --- Drawing Logic ---
  const drawArrowHead = (ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-size, size / 2.5);
    ctx.lineTo(-size * 0.7, 0);
    ctx.lineTo(-size, -size / 2.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    const drawDim = (dim: Partial<Dimension> & { isPreview?: boolean }, index: number) => {
      const { startX = 0, startY = 0, endX = 0, endY = 0, value, unit, color, width = 2, isPreview } = dim;
      const isHovered = index === hoveredIndex;

      ctx.save();
      if (isHovered && hoveredPart === 'line') {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
        ctx.shadowBlur = 10;
      }

      ctx.strokeStyle = color || currentColor;
      ctx.fillStyle = color || currentColor;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';

      // Main line
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      const dx = endX - startX;
      const dy = endY - startY;
      const angle = Math.atan2(dy, dx);
      const arrowSize = Math.max(12, width * 4);

      drawArrowHead(ctx, startX, startY, angle + Math.PI, arrowSize);
      drawArrowHead(ctx, endX, endY, angle, arrowSize);

      if (isHovered && (hoveredPart === 'start' || hoveredPart === 'end')) {
        ctx.beginPath();
        ctx.arc(hoveredPart === 'start' ? startX : endX, hoveredPart === 'start' ? startY : endY, width * 2 + 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fill();
        ctx.stroke();
      }

      if (!isPreview && value) {
        const midX = startX + dx / 2;
        const midY = startY + dy / 2;
        
        let text = `${value} ${unit}`;
        const numVal = parseFloat(value || '0');
        if (!isNaN(numVal)) {
          if (unit === 'cm') {
            const converted = (numVal / 2.54).toFixed(1);
            text = `${value} cm / ${converted} in`;
          } else {
            const converted = (numVal * 2.54).toFixed(1);
            text = `${value} in / ${converted} cm`;
          }
        }

        const fontSize = Math.max(16, Math.floor(canvas.width / 60));
        ctx.font = `600 ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        let textAngle = angle;
        if (textAngle > Math.PI / 2 || textAngle < -Math.PI / 2) textAngle += Math.PI;

        ctx.translate(midX + (dim.textOffsetX || 0), midY + (dim.textOffsetY || 0));
        ctx.rotate(textAngle);

        const metrics = ctx.measureText(text);
        const textWidth = metrics.width;
        const paddingX = fontSize * 0.4;
        const paddingY = fontSize * 0.2;
        const offsetY = -(fontSize / 2 + width + 4);

        if (isHovered && hoveredPart === 'text') {
          ctx.shadowColor = 'rgba(59, 130, 246, 0.5)';
          ctx.shadowBlur = 8;
        }

        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        const rectX = -textWidth / 2 - paddingX;
        const rectY = offsetY - fontSize / 2 - paddingY;
        const rectW = textWidth + paddingX * 2;
        const rectH = fontSize + paddingY * 2;
        
        ctx.beginPath();
        ctx.roundRect(rectX, rectY, rectW, rectH, 4);
        ctx.fill();
        
        if (isHovered && hoveredPart === 'text') {
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        ctx.shadowBlur = 0;
        ctx.fillStyle = color || currentColor;
        ctx.fillText(text, 0, offsetY);

        // Update hitbox for interaction
        const gx = midX + (dim.textOffsetX || 0) - offsetY * Math.sin(textAngle);
        const gy = midY + (dim.textOffsetY || 0) + offsetY * Math.cos(textAngle);
        if (index !== -1) {
          dimensions[index]._textHitbox = { x: gx, y: gy, r: textWidth / 2 + paddingX };
        }
      }

      ctx.restore();
    };

    dimensions.forEach((dim, i) => drawDim(dim, i));
    if (tempLine) {
      drawDim({
        startX: tempLine.start.x,
        startY: tempLine.start.y,
        endX: tempLine.end.x,
        endY: tempLine.end.y,
        color: currentColor,
        width: currentWidth,
        isPreview: true
      }, -1);
    }
  }, [image, dimensions, tempLine, hoveredIndex, hoveredPart, currentColor, currentWidth]);

  useEffect(() => {
    render();
  }, [render]);

  // --- Handlers ---
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!image || showInput) return;
    const pos = getMousePos(e);

    if (hoveredIndex !== -1) {
      setDraggingIndex(hoveredIndex);
      setDraggingPart(hoveredPart);
      setLastMousePos(pos);
      return;
    }

    setIsDrawing(true);
    setTempLine({ start: pos, end: pos });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!image) return;
    const pos = getMousePos(e);

    if (draggingIndex !== -1) {
      const dx = pos.x - lastMousePos.x;
      const dy = pos.y - lastMousePos.y;
      
      setDimensions(prev => {
        const next = [...prev];
        const dim = { ...next[draggingIndex] };
        if (draggingPart === 'start') {
          dim.startX += dx; dim.startY += dy;
        } else if (draggingPart === 'end') {
          dim.endX += dx; dim.endY += dy;
        } else if (draggingPart === 'line') {
          dim.startX += dx; dim.startY += dy;
          dim.endX += dx; dim.endY += dy;
        } else if (draggingPart === 'text') {
          dim.textOffsetX += dx; dim.textOffsetY += dy;
        }
        next[draggingIndex] = dim;
        return next;
      });
      setLastMousePos(pos);
      return;
    }

    if (isDrawing && tempLine) {
      setTempLine({ ...tempLine, end: pos });
      return;
    }

    // Hover detection
    let foundIndex = -1;
    let foundPart: Part = null;
    const threshold = Math.max(12, (canvasRef.current?.width || 1000) / 100);

    for (let i = dimensions.length - 1; i >= 0; i--) {
      const dim = dimensions[i];
      if (dim._textHitbox && Math.hypot(pos.x - dim._textHitbox.x, pos.y - dim._textHitbox.y) < dim._textHitbox.r) {
        foundIndex = i; foundPart = 'text'; break;
      }
      if (Math.hypot(pos.x - dim.startX, pos.y - dim.startY) < threshold) {
        foundIndex = i; foundPart = 'start'; break;
      }
      if (Math.hypot(pos.x - dim.endX, pos.y - dim.endY) < threshold) {
        foundIndex = i; foundPart = 'end'; break;
      }
      const dist = distPointToSegment(pos.x, pos.y, dim.startX, dim.startY, dim.endX, dim.endY);
      if (dist < threshold + dim.width) {
        foundIndex = i; foundPart = 'line'; break;
      }
    }

    setHoveredIndex(foundIndex);
    setHoveredPart(foundPart);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (draggingIndex !== -1) {
      setDraggingIndex(-1);
      setDraggingPart(null);
      return;
    }

    if (isDrawing && tempLine) {
      setIsDrawing(false);
      const dist = Math.hypot(tempLine.end.x - tempLine.start.x, tempLine.end.y - tempLine.start.y);
      if (dist < 15) {
        setTempLine(null);
        return;
      }
      setShowInput({ x: e.clientX, y: e.clientY });
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        setImage(img);
        setDimensions([]);
        if (canvasRef.current) {
          canvasRef.current.width = img.width;
          canvasRef.current.height = img.height;
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const saveDimension = () => {
    if (inputValue && tempLine) {
      setDimensions(prev => [...prev, {
        id: Math.random().toString(36).substr(2, 9),
        startX: tempLine.start.x,
        startY: tempLine.start.y,
        endX: tempLine.end.x,
        endY: tempLine.end.y,
        value: inputValue,
        unit: currentUnit,
        color: currentColor,
        width: currentWidth,
        textOffsetX: 0,
        textOffsetY: 0
      }]);
    }
    setShowInput(null);
    setTempLine(null);
    setInputValue('');
  };

  const downloadImage = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `dimension-studio-${Date.now()}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  // --- Keyboard micro-adjustments ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showInput || hoveredIndex === -1) return;
      
      const step = e.shiftKey ? 5 : 1;
      let dx = 0, dy = 0;
      if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      else if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;

      if (dx !== 0 || dy !== 0) {
        e.preventDefault();
        setDimensions(prev => {
          const next = [...prev];
          const dim = { ...next[hoveredIndex] };
          if (hoveredPart === 'text') {
            dim.textOffsetX += dx; dim.textOffsetY += dy;
          } else if (hoveredPart === 'start') {
            dim.startX += dx; dim.startY += dy;
          } else if (hoveredPart === 'end') {
            dim.endX += dx; dim.endY += dy;
          } else {
            dim.startX += dx; dim.startY += dy;
            dim.endX += dx; dim.endY += dy;
          }
          next[hoveredIndex] = dim;
          return next;
        });
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        setDimensions(prev => prev.filter((_, i) => i !== hoveredIndex));
        setHoveredIndex(-1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showInput, hoveredIndex, hoveredPart]);

  return (
    <div className="flex h-screen bg-[#f8f9fa] text-slate-900 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-72 bg-white border-r border-slate-200 flex flex-col shadow-sm z-20">
        <div className="p-6 border-b border-slate-100 flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Ruler className="text-white w-5 h-5" />
          </div>
          <h1 className="font-bold text-lg tracking-tight">尺寸大师</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
          {/* Section 1: Image */}
          <section className="space-y-3">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <ImagePlus className="w-3 h-3" /> 图片源
            </label>
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/*"
              className="hidden"
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-8 border-2 border-dashed border-slate-200 rounded-xl hover:border-blue-400 hover:bg-blue-50/50 transition-all group flex flex-col items-center gap-2"
            >
              <ImagePlus className="w-6 h-6 text-slate-300 group-hover:text-blue-500 transition-colors" />
              <span className="text-sm font-medium text-slate-500 group-hover:text-blue-600">上传产品照片</span>
            </button>
            {image && (
              <button 
                onClick={() => { setImage(null); setDimensions([]); }}
                className="w-full py-2 text-xs font-medium text-red-500 hover:text-red-600 transition-colors"
              >
                清除当前图片
              </button>
            )}
          </section>

          {/* Section 2: Settings */}
          <section className="space-y-6">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Settings2 className="w-3 h-3" /> 标注设置
            </label>
            
            <div className="space-y-2">
              <span className="text-xs font-medium text-slate-600">主要单位</span>
              <div className="flex bg-slate-100 p-1 rounded-lg">
                {(['cm', 'in'] as const).map(u => (
                  <button
                    key={u}
                    onClick={() => setCurrentUnit(u)}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                      currentUnit === u ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {u === 'cm' ? '公制 (cm)' : '英制 (in)'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-slate-600">线条颜色</span>
                <span className="text-[10px] font-mono text-slate-400 uppercase">{currentColor}</span>
              </div>
              <div className="flex gap-2">
                {['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#000000'].map(c => (
                  <button
                    key={c}
                    onClick={() => setCurrentColor(c)}
                    className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${
                      currentColor === c ? 'border-slate-300 scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input 
                  type="color" 
                  value={currentColor} 
                  onChange={(e) => setCurrentColor(e.target.value)}
                  className="w-6 h-6 rounded-full overflow-hidden border-0 p-0 cursor-pointer"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-slate-600">线条粗细</span>
                <span className="text-[10px] font-mono text-slate-400">{currentWidth}px</span>
              </div>
              <input 
                type="range" 
                min="1" 
                max="12" 
                value={currentWidth} 
                onChange={(e) => setCurrentWidth(parseInt(e.target.value))}
                className="w-full accent-blue-600"
              />
            </div>
          </section>

          {/* Section 3: Actions */}
          <section className="space-y-3">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Move className="w-3 h-3" /> 操作
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={() => setDimensions(prev => prev.slice(0, -1))}
                disabled={dimensions.length === 0}
                className="flex items-center justify-center gap-2 py-2 border border-slate-200 rounded-lg text-xs font-medium hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                <Undo className="w-3 h-3" /> 撤销
              </button>
              <button 
                onClick={() => setDimensions([])}
                disabled={dimensions.length === 0}
                className="flex items-center justify-center gap-2 py-2 border border-slate-200 rounded-lg text-xs font-medium hover:bg-red-50 hover:text-red-600 hover:border-red-100 disabled:opacity-40 transition-colors"
              >
                <Trash2 className="w-3 h-3" /> 清空
              </button>
            </div>
          </section>
        </div>

        <div className="p-6 bg-slate-50 border-t border-slate-100">
          <div className="flex items-start gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
            <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-[10px] text-slate-500 leading-relaxed">
              <p className="font-bold text-slate-700 mb-1">快速指南：</p>
              <ul className="list-disc pl-3 space-y-1">
                <li>在图片上拖动以绘制尺寸线</li>
                <li>拖动端点或标签进行调整</li>
                <li>使用方向键进行微调</li>
                <li>Delete/Backspace 键删除选中项</li>
              </ul>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0 z-10">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full text-slate-500">
              <MousePointer2 className="w-3 h-3" />
              <span className="text-[10px] font-bold uppercase tracking-widest">编辑模式</span>
            </div>
          </div>
          <button 
            onClick={downloadImage}
            disabled={!image}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-semibold text-sm transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:shadow-none"
          >
            <Download className="w-4 h-4" /> 导出结果
          </button>
        </header>

        {/* Canvas Area */}
        <div 
          ref={containerRef}
          className="flex-1 overflow-auto bg-[#e9ecef] flex items-center justify-center p-12 relative"
        >
          {!image && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center space-y-4"
            >
              <div className="w-20 h-20 bg-white rounded-3xl shadow-xl flex items-center justify-center mx-auto">
                <ImagePlus className="w-8 h-8 text-slate-300" />
              </div>
              <div>
                <h2 className="text-slate-400 font-medium">未加载图片</h2>
                <p className="text-slate-300 text-sm">上传一张产品照片开始标注</p>
              </div>
            </motion.div>
          )}

          <canvas 
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
              setDraggingIndex(-1);
              setHoveredIndex(-1);
              setIsDrawing(false);
            }}
            className={`bg-white shadow-2xl transition-opacity duration-500 ${image ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${hoveredIndex !== -1 ? 'cursor-move' : 'cursor-crosshair'}`}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />

          {/* Floating Input */}
          <AnimatePresence>
            {showInput && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 10 }}
                className="fixed z-50 bg-white p-4 rounded-xl shadow-2xl border border-slate-200 flex items-center gap-3"
                style={{ left: showInput.x, top: showInput.y - 60, transform: 'translateX(-50%)' }}
              >
                <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-100">
                  <Type className="w-4 h-4 text-slate-400" />
                  <input 
                    autoFocus
                    type="number" 
                    placeholder="数值"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveDimension()}
                    className="bg-transparent border-none outline-none text-sm font-semibold w-20 text-slate-700"
                  />
                  <span className="text-xs font-bold text-slate-400 uppercase">{currentUnit}</span>
                </div>
                <div className="flex gap-1">
                  <button 
                    onClick={saveDimension}
                    className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => { setShowInput(null); setTempLine(null); setInputValue(''); }}
                    className="p-2 bg-slate-100 text-slate-400 rounded-lg hover:bg-slate-200 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
