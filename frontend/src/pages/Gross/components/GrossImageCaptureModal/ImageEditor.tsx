import React, { useState, useRef, useEffect } from "react";
import { Stage, Layer, Image as KonvaImage, Line, Arrow, Circle, Ellipse, Text as KonvaText } from "react-konva";
import type Konva from "konva";
import ReactCrop, { Crop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Button, Space, Typography, Tooltip, Radio, ColorPicker, Input, InputNumber } from "antd";
import {
  ScissorOutlined,
  EditOutlined,
  UndoOutlined,
  ClearOutlined,
  SaveOutlined,
  LineOutlined,
  ArrowRightOutlined,
  Loading3QuartersOutlined,
  FontSizeOutlined,
  MinusOutlined
} from "@ant-design/icons";
import useImage from "use-image";
import styles from "./GrossImageCaptureModal.module.css";

const { Text } = Typography;

interface ImageEditorProps {
  imageSrc: string;
  onSave: (finalImageSrc: string) => void;
  onCancel: () => void;
}

export const ImageEditor: React.FC<ImageEditorProps> = ({
  imageSrc,
  onSave,
  onCancel,
}) => {
  // Mode: 'view', 'crop', 'draw'
  const [mode, setMode] = useState<"view" | "crop" | "draw">("view");

  // --- react-image-crop state ---
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<Crop>();
  const imgRef = useRef<HTMLImageElement>(null);
  
  // Base image to work with, it can be updated after cropping
  const [currentImageSrc, setCurrentImageSrc] = useState(imageSrc);

  // --- react-konva state ---
  const [image] = useImage(currentImageSrc);
  
  // Update shapes to allow different types
  type ShapeType = "freehand" | "arrow" | "circle" | "text" | "line";
  interface ShapeItem {
    type: ShapeType;
    points: number[];
    color: string;
    size: number;
    textStr?: string; // For text shapes
  }
  const [shapes, setShapes] = useState<ShapeItem[]>([]);
  const [drawTool, setDrawTool] = useState<ShapeType>("freehand");
  const [drawColor, setDrawColor] = useState<string>("#ef4444"); // Default Red
  const [drawSize, setDrawSize] = useState<number>(5); // Default size (stroke width)
  const [textInput, setTextInput] = useState<string>("Text..."); // Default text

  const isDrawing = useRef(false);
  const stageRef = useRef<Konva.Stage>(null);

  // Resize stage to fit parent
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current && image) {
      // Calculate aspect ratio fit
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = 500; // Fixed max height match UI

      const widthRatio = containerWidth / image.width;
      const heightRatio = containerHeight / image.height;
      const bestRatio = Math.min(widthRatio, heightRatio, 1);

      setStageSize({
        width: image.width * bestRatio,
        height: image.height * bestRatio,
      });
    }
  }, [image, currentImageSrc]);

  // --- Drawing functions ---
  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (mode !== "draw") return;
    const pos = e.target.getStage().getPointerPosition();

    if (drawTool === "text") {
      // For text, we just stamp it on click. Use a larger default multiplier if drawSize is small
      setShapes([...shapes, { type: "text", points: [pos.x, pos.y], color: drawColor, size: drawSize * 6, textStr: textInput }]);
      return;
    }

    isDrawing.current = true;
    setShapes([...shapes, { type: drawTool, points: [pos.x, pos.y], color: drawColor, size: drawSize }]);
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isDrawing.current || mode !== "draw") return;
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    
    let lastShape = { ...shapes[shapes.length - 1] };
    
    // Ignore move for text since it's stamped on click
    if (lastShape.type === "text") return;

    if (lastShape.type === "freehand") {
      lastShape.points = lastShape.points.concat([point.x, point.y]);
    } else if (lastShape.type === "arrow" || lastShape.type === "circle" || lastShape.type === "line") {
      // For arrow, circle, and straight line, just keep start point and update end point
      lastShape.points = [lastShape.points[0], lastShape.points[1], point.x, point.y];
    }

    const newShapes = shapes.slice(0, -1);
    newShapes.push(lastShape);
    setShapes(newShapes);
  };

  const handleMouseUp = () => {
    isDrawing.current = false;
  };

  const undoDraw = () => {
    setShapes(shapes.slice(0, -1));
  };

  const clearDraw = () => {
    setShapes([]);
  };

  // --- Cropping Functions ---
  const handleCropComplete = async () => {
    if (completedCrop && imgRef.current && completedCrop.width > 0 && completedCrop.height > 0) {
      const croppedImageStr = await getCroppedImg(imgRef.current, completedCrop);
      setCurrentImageSrc(croppedImageStr);
      setMode("view");
      setCrop(undefined);
      setCompletedCrop(undefined);
      setShapes([]); // Clear drawings when cropping occurs since coords change
    }
  };

  const getCroppedImg = (image: HTMLImageElement, crop: Crop): Promise<string> => {
    const canvas = document.createElement("canvas");
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    canvas.width = crop.width;
    canvas.height = crop.height;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      ctx.drawImage(
        image,
        crop.x * scaleX,
        crop.y * scaleY,
        crop.width * scaleX,
        crop.height * scaleY,
        0,
        0,
        crop.width,
        crop.height
      );
    }
    return new Promise((resolve) => {
      resolve(canvas.toDataURL("image/jpeg"));
    });
  };

  // --- Final Save ---
  const handleFinalSave = () => {
    // If not drawing, just save currentImageSrc (or cropped result)
    if (shapes.length === 0) {
      onSave(currentImageSrc);
      return;
    }

    // If there are drawings, export the konva stage
    if (stageRef.current) {
      // Need to convert rendered stage back to data url
      const finalUri = stageRef.current.toDataURL({ pixelRatio: 2 });
      onSave(finalUri);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
      {/* TOOLBAR */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 16 }}>
        {/* ROW 1: Main Controls */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Space>
            <Button
              type={mode === "crop" ? "primary" : "default"}
              icon={<ScissorOutlined />}
              onClick={() => setMode(mode === "crop" ? "view" : "crop")}
            >
              Crop
            </Button>
            <Button
              type={mode === "draw" ? "primary" : "default"}
              icon={<EditOutlined />}
              onClick={() => setMode(mode === "draw" ? "view" : "draw")}
            >
              Annotate / Pen
            </Button>
            {mode === "crop" && completedCrop && (
              <Button type="primary" onClick={handleCropComplete}>
                Apply Crop
              </Button>
            )}
          </Space>
          
          <Space>
            <Button onClick={onCancel}>Cancel</Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleFinalSave}>
              Done & Save
            </Button>
          </Space>
        </div>

        {/* ROW 2: Drawing Tools (Only visible in draw mode) */}
        {mode === "draw" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, padding: "8px 16px", backgroundColor: "#f0f2f5", borderRadius: 8, alignItems: "center" }}>
            <Space wrap>
              <Radio.Group 
                value={drawTool} 
                onChange={(e) => setDrawTool(e.target.value)}
                optionType="button"
                buttonStyle="solid"
              >
                <Radio.Button value="freehand"><EditOutlined /> Pen</Radio.Button>
                <Radio.Button value="line"><MinusOutlined /> Line</Radio.Button>
                <Radio.Button value="arrow"><ArrowRightOutlined /> Arrow</Radio.Button>
                <Radio.Button value="circle"><Loading3QuartersOutlined /> Circle</Radio.Button>
                <Radio.Button value="text"><FontSizeOutlined /> Text</Radio.Button>
              </Radio.Group>
            
              {drawTool === "text" && (
                <Input 
                  value={textInput} 
                  onChange={(e) => setTextInput(e.target.value)} 
                  style={{ width: 120 }} 
                  placeholder="Enter text..." 
                />
              )}

              <Space>
                 <Text>Size:</Text>
                 <InputNumber 
                    min={1} 
                    max={50} 
                    value={drawSize} 
                    onChange={(val) => setDrawSize(val || 5)} 
                 />
              </Space>

              <ColorPicker 
                value={drawColor} 
                onChange={(_, hex) => setDrawColor(hex)} 
                presets={[
                  {
                    label: 'Recommended',
                    colors: [
                      '#ef4444', // Red
                      '#3b82f6', // Blue
                      '#10b981', // Green
                      '#f59e0b', // Yellow
                      '#000000', // Black
                      '#ffffff'  // White
                    ],
                  },
                ]}
              />

              <Tooltip title="Undo last shape">
                <Button icon={<UndoOutlined />} onClick={undoDraw} disabled={shapes.length === 0} />
              </Tooltip>
              <Tooltip title="Clear all drawings">
                <Button icon={<ClearOutlined />} onClick={clearDraw} disabled={shapes.length === 0} />
              </Tooltip>
            </Space>
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
         <Text type="secondary">
           {mode === 'crop' 
             ? 'Drag to select area to crop.' 
             : mode === 'draw' 
               ? (drawTool === 'text' ? 'Type text in the box and click anywhere to stamp.' : 'Click and drag to draw on the image.') 
               : 'Preview the image. Choose Crop or Annotate to modify.'}
         </Text>
      </div>

      {/* EDITOR AREA */}
      <div 
        ref={containerRef} 
        style={{ 
          flex: 1, 
          display: "flex", 
          justifyContent: "center", 
          alignItems: "center", 
          overflow: "hidden", 
          backgroundColor: "#f5f5f5",
          border: "1px solid #d9d9d9",
          borderRadius: 8,
          minHeight: 500
        }}
      >
        {mode === "crop" ? (
          <ReactCrop crop={crop} onChange={(c) => setCrop(c)} onComplete={(c) => setCompletedCrop(c)}>
            <img 
               ref={imgRef} 
               src={currentImageSrc} 
               style={{ maxHeight: 500, maxWidth: "100%", objectFit: "contain" }} 
               alt="Crop preview" 
            />
          </ReactCrop>
        ) : (
          <Stage
            width={stageSize.width}
            height={stageSize.height}
            onMouseDown={handleMouseDown}
            onMousemove={handleMouseMove}
            onMouseup={handleMouseUp}
            onTouchStart={handleMouseDown as unknown as (e: Konva.KonvaEventObject<TouchEvent>) => void}
            onTouchMove={handleMouseMove as unknown as (e: Konva.KonvaEventObject<TouchEvent>) => void}
            onTouchEnd={handleMouseUp}
            ref={stageRef}
            style={{ 
              cursor: mode === "draw" ? "crosshair" : "default",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)" 
            }}
          >
            <Layer>
              {image && (
                 <KonvaImage 
                    image={image} 
                    width={stageSize.width} 
                    height={stageSize.height} 
                 />
              )}
              {shapes.map((shape, i) => {
                if (shape.type === "freehand") {
                  return (
                    <Line
                      key={i}
                      points={shape.points}
                      stroke={shape.color} 
                      strokeWidth={shape.size}
                      tension={0.5}
                      lineCap="round"
                      lineJoin="round"
                    />
                  );
                } else if (shape.type === "line" && shape.points.length >= 4) {
                  return (
                    <Line
                      key={i}
                      points={shape.points}
                      stroke={shape.color} 
                      strokeWidth={shape.size}
                      tension={0}
                      lineCap="round"
                      lineJoin="round"
                    />
                  );
                } else if (shape.type === "arrow" && shape.points.length >= 4) {
                  return (
                    <Arrow
                      key={i}
                      points={shape.points}
                      stroke={shape.color}
                      fill={shape.color}
                      strokeWidth={shape.size}
                      pointerLength={shape.size * 3}
                      pointerWidth={shape.size * 3}
                    />
                  );
                } else if (shape.type === "circle" && shape.points.length >= 4) {
                  // Calculate radius and center for Ellipse to allow drawing from start to end point
                  const startX = shape.points[0];
                  const startY = shape.points[1];
                  const endX = shape.points[2];
                  const endY = shape.points[3];
                  const radiusX = Math.abs(endX - startX) / 2;
                  const radiusY = Math.abs(endY - startY) / 2;
                  const centerX = Math.min(startX, endX) + radiusX;
                  const centerY = Math.min(startY, endY) + radiusY;
                  
                  return (
                    <Ellipse
                      key={i}
                      x={centerX}
                      y={centerY}
                      radiusX={radiusX}
                      radiusY={radiusY}
                      stroke={shape.color}
                      strokeWidth={shape.size}
                    />
                  );
                } else if (shape.type === "text") {
                  return (
                    <KonvaText
                      key={i}
                      x={shape.points[0]}
                      y={shape.points[1]}
                      text={shape.textStr || ""}
                      fontSize={shape.size}
                      fill={shape.color}
                      fontFamily="sans-serif"
                      fontStyle="bold"
                    />
                  );
                }
                return null;
              })}
            </Layer>
          </Stage>
        )}
      </div>
    </div>
  );
};
