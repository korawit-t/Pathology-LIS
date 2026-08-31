import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import {
  Stage,
  Layer,
  Group,
  Image as KonvaImage,
  Line,
  Arrow,
  Ellipse,
  Text as KonvaText,
} from "react-konva";
import type Konva from "konva";
import ReactCrop, { Crop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import {
  App,
  Button,
  Space,
  Typography,
  Tooltip,
  Radio,
  ColorPicker,
  Input,
  InputNumber,
  Divider,
} from "antd";
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
  MinusOutlined,
  RotateLeftOutlined,
  RotateRightOutlined,
  SwapOutlined,
} from "@ant-design/icons";
import useImage from "use-image";
import {
  computeLayout,
  transformPoints,
  translatePoints,
  intersectsBox,
  type Rotation,
} from "../utils/imageTransform";

const { Text } = Typography;

/** Max height of the editor canvas area, in CSS px. */
const PREVIEW_MAX_HEIGHT = 500;

type ShapeType = "freehand" | "arrow" | "circle" | "text" | "line";

interface ShapeItem {
  type: ShapeType;
  /**
   * Flat [x0, y0, x1, y1, ...] in NATURAL image pixels — not stage/display
   * pixels. Keeping them in the image's own coordinate space is what lets a
   * crop translate them instead of discarding them, and lets the stage be
   * resized (fit-to-container, rotation) without invalidating them.
   */
  points: number[];
  color: string;
  /** Stroke width / font size, also in natural image pixels. */
  size: number;
  textStr?: string;
}

interface ImageEditorProps {
  imageSrc: string;
  onSave: (finalImageSrc: string) => void;
  onCancel: () => void;
  /** Overrides the confirm button label (e.g. when re-editing an upload). */
  saveLabel?: string;
}

export const ImageEditor: React.FC<ImageEditorProps> = ({
  imageSrc,
  onSave,
  onCancel,
  saveLabel = "Done & Save",
}) => {
  const { message } = App.useApp();
  const [mode, setMode] = useState<"view" | "crop" | "draw">("view");

  // --- react-image-crop state ---
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<Crop>();
  const imgRef = useRef<HTMLImageElement>(null);

  // Base image to work with; replaced whenever a transform is baked in.
  const [currentImageSrc, setCurrentImageSrc] = useState(imageSrc);
  const [image] = useImage(currentImageSrc);

  // --- transform state (not baked until a crop or the final save) ---
  const [rotation, setRotation] = useState<Rotation>(0);
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const isTransformed = rotation !== 0 || flipH || flipV;

  // --- annotation state ---
  const [shapes, setShapes] = useState<ShapeItem[]>([]);
  const [drawTool, setDrawTool] = useState<ShapeType>("freehand");
  const [drawColor, setDrawColor] = useState<string>("#ef4444");
  const [drawSize, setDrawSize] = useState<number>(5);
  const [textInput, setTextInput] = useState<string>("Text...");

  const isDrawing = useRef(false);
  const stageRef = useRef<Konva.Stage>(null);
  const groupRef = useRef<Konva.Group>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [fitScale, setFitScale] = useState(1);

  // Fit the (possibly rotated) image into the preview area.
  useEffect(() => {
    if (!containerRef.current || !image) return;
    const unscaled = computeLayout(image.width, image.height, 1, rotation, flipH, flipV);
    const containerWidth = containerRef.current.clientWidth;
    const next = Math.min(
      containerWidth / unscaled.width,
      PREVIEW_MAX_HEIGHT / unscaled.height,
      1,
    );
    setFitScale(next > 0 ? next : 1);
  }, [image, currentImageSrc, rotation, flipH, flipV]);

  const layout = useMemo(
    () =>
      image ? computeLayout(image.width, image.height, fitScale, rotation, flipH, flipV) : null,
    [image, fitScale, rotation, flipH, flipV],
  );

  // --- Drawing ---
  // Sizes are entered in on-screen px so the pen feels the same regardless of
  // source resolution, but stored in natural px so they scale with the export.
  const toNatural = useCallback((displaySize: number) => displaySize / (fitScale || 1), [fitScale]);

  const handleMouseDown = () => {
    if (mode !== "draw") return;
    const pos = groupRef.current?.getRelativePointerPosition();
    if (!pos) return;

    if (drawTool === "text") {
      setShapes([
        ...shapes,
        {
          type: "text",
          points: [pos.x, pos.y],
          color: drawColor,
          size: toNatural(drawSize * 6),
          textStr: textInput,
        },
      ]);
      return;
    }

    isDrawing.current = true;
    setShapes([
      ...shapes,
      { type: drawTool, points: [pos.x, pos.y], color: drawColor, size: toNatural(drawSize) },
    ]);
  };

  const handleMouseMove = () => {
    if (!isDrawing.current || mode !== "draw") return;
    const point = groupRef.current?.getRelativePointerPosition();
    if (!point) return;

    const lastShape = { ...shapes[shapes.length - 1] };
    if (lastShape.type === "text") return;

    if (lastShape.type === "freehand") {
      lastShape.points = lastShape.points.concat([point.x, point.y]);
    } else {
      // arrow / circle / straight line keep their start and track the end
      lastShape.points = [lastShape.points[0], lastShape.points[1], point.x, point.y];
    }

    setShapes([...shapes.slice(0, -1), lastShape]);
  };

  const handleMouseUp = () => {
    isDrawing.current = false;
  };

  const undoDraw = () => setShapes(shapes.slice(0, -1));
  const clearDraw = () => setShapes([]);

  // --- Transform ---
  /**
   * Flatten the pending rotation/flip into `currentImageSrc` and move the
   * annotations into the new frame with it. Needed before cropping, because
   * ReactCrop measures against a plain upright <img>.
   */
  const bakeTransform = useCallback(() => {
    if (!image || !isTransformed) return;
    const exportLayout = computeLayout(image.width, image.height, 1, rotation, flipH, flipV);
    const canvas = document.createElement("canvas");
    canvas.width = exportLayout.width;
    canvas.height = exportLayout.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.translate(exportLayout.x, exportLayout.y);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(exportLayout.scaleX, exportLayout.scaleY);
    ctx.drawImage(image, 0, 0);

    setShapes((prev) =>
      prev.map((s) => ({ ...s, points: transformPoints(s.points, exportLayout, rotation) })),
    );
    setCurrentImageSrc(canvas.toDataURL("image/jpeg", 0.95));
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
  }, [image, isTransformed, rotation, flipH, flipV]);

  const rotateBy = (delta: 90 | -90) => {
    setRotation((((rotation + delta + 360) % 360) as Rotation));
  };

  const enterCropMode = () => {
    // Bake first so ReactCrop always measures an upright image and
    // getCroppedImg's natural-pixel maths stays unchanged.
    if (isTransformed) bakeTransform();
    setMode("crop");
  };

  // --- Cropping ---
  const getCroppedImg = (img: HTMLImageElement, c: Crop): string => {
    const canvas = document.createElement("canvas");
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;
    // Crop x/y/width/height are in on-screen (displayed) pixels; the canvas
    // must be sized in natural pixels or the output gets downsampled to
    // display resolution.
    const pixelCropWidth = c.width * scaleX;
    const pixelCropHeight = c.height * scaleY;
    canvas.width = pixelCropWidth;
    canvas.height = pixelCropHeight;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      ctx.drawImage(
        img,
        c.x * scaleX,
        c.y * scaleY,
        pixelCropWidth,
        pixelCropHeight,
        0,
        0,
        pixelCropWidth,
        pixelCropHeight,
      );
    }
    return canvas.toDataURL("image/jpeg", 0.95);
  };

  const handleCropComplete = () => {
    if (!completedCrop || !imgRef.current) return;
    if (completedCrop.width <= 0 || completedCrop.height <= 0) return;

    const img = imgRef.current;
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;
    const originX = completedCrop.x * scaleX;
    const originY = completedCrop.y * scaleY;
    const cropWidth = completedCrop.width * scaleX;
    const cropHeight = completedCrop.height * scaleY;

    setCurrentImageSrc(getCroppedImg(img, completedCrop));

    // Annotations survive the crop: shift them into the new frame and drop
    // only the ones that fall entirely outside it.
    setShapes((prev) =>
      prev
        .map((shape) => ({
          ...shape,
          points: translatePoints(shape.points, -originX, -originY),
        }))
        .filter((shape) => intersectsBox(shape.points, cropWidth, cropHeight)),
    );

    setMode("view");
    setCrop(undefined);
    setCompletedCrop(undefined);
  };

  // --- Final save ---
  const handleFinalSave = () => {
    // Nothing pending — hand back the current bytes untouched rather than
    // paying another JPEG re-encode.
    if (shapes.length === 0 && !isTransformed) {
      onSave(currentImageSrc);
      return;
    }

    if (!image) {
      message.error("Image is still loading — please wait a moment and try again.");
      return;
    }

    const stage = stageRef.current;
    const group = groupRef.current;
    if (!stage || !group) {
      message.error("Could not export the image. Please try again.");
      return;
    }

    // The stage is rendered at preview size to keep the editor usable, so
    // exporting as-is would cap the result at preview resolution. Swap in the
    // natural-resolution layout, export, then restore so the UI is unaffected.
    const exportLayout = computeLayout(image.width, image.height, 1, rotation, flipH, flipV);
    const prev = {
      width: stage.width(),
      height: stage.height(),
      x: group.x(),
      y: group.y(),
      scaleX: group.scaleX(),
      scaleY: group.scaleY(),
    };

    stage.width(exportLayout.width);
    stage.height(exportLayout.height);
    group.position({ x: exportLayout.x, y: exportLayout.y });
    group.scale({ x: exportLayout.scaleX, y: exportLayout.scaleY });
    stage.batchDraw();

    const finalUri = stage.toDataURL({ mimeType: "image/jpeg", quality: 0.95 });

    stage.width(prev.width);
    stage.height(prev.height);
    group.position({ x: prev.x, y: prev.y });
    group.scale({ x: prev.scaleX, y: prev.scaleY });
    stage.batchDraw();

    onSave(finalUri);
  };

  const hintText =
    mode === "crop"
      ? "Drag to select area to crop. Annotations are kept and moved with the crop."
      : mode === "draw"
        ? drawTool === "text"
          ? "Type text in the box and click anywhere to stamp."
          : "Click and drag to draw on the image."
        : "Preview the image. Rotate, crop or annotate to modify.";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
      {/* TOOLBAR */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Space wrap>
            <Button
              type={mode === "crop" ? "primary" : "default"}
              icon={<ScissorOutlined />}
              onClick={() => (mode === "crop" ? setMode("view") : enterCropMode())}
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

            {mode !== "crop" && (
              <>
                <Divider orientation="vertical" style={{ margin: 0 }} />
                <Tooltip title="Rotate left 90°">
                  <Button icon={<RotateLeftOutlined />} onClick={() => rotateBy(-90)} />
                </Tooltip>
                <Tooltip title="Rotate right 90°">
                  <Button icon={<RotateRightOutlined />} onClick={() => rotateBy(90)} />
                </Tooltip>
                <Tooltip title="Flip horizontally">
                  <Button
                    type={flipH ? "primary" : "default"}
                    icon={<SwapOutlined />}
                    onClick={() => setFlipH(!flipH)}
                  />
                </Tooltip>
                <Tooltip title="Flip vertically">
                  <Button
                    type={flipV ? "primary" : "default"}
                    icon={<SwapOutlined rotate={90} />}
                    onClick={() => setFlipV(!flipV)}
                  />
                </Tooltip>
              </>
            )}
          </Space>

          <Space>
            <Button onClick={onCancel}>Cancel</Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleFinalSave}
              disabled={!image}
            >
              {saveLabel}
            </Button>
          </Space>
        </div>

        {mode === "draw" && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
              padding: "8px 16px",
              backgroundColor: "#f0f2f5",
              borderRadius: 8,
              alignItems: "center",
            }}
          >
            <Space wrap>
              <Radio.Group
                value={drawTool}
                onChange={(e) => setDrawTool(e.target.value)}
                optionType="button"
                buttonStyle="solid"
              >
                <Radio.Button value="freehand">
                  <EditOutlined /> Pen
                </Radio.Button>
                <Radio.Button value="line">
                  <MinusOutlined /> Line
                </Radio.Button>
                <Radio.Button value="arrow">
                  <ArrowRightOutlined /> Arrow
                </Radio.Button>
                <Radio.Button value="circle">
                  <Loading3QuartersOutlined /> Circle
                </Radio.Button>
                <Radio.Button value="text">
                  <FontSizeOutlined /> Text
                </Radio.Button>
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
                    label: "Recommended",
                    colors: [
                      "#ef4444", // Red
                      "#3b82f6", // Blue
                      "#10b981", // Green
                      "#f59e0b", // Yellow
                      "#000000", // Black
                      "#ffffff", // White
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
        <Text type="secondary">{hintText}</Text>
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
          minHeight: PREVIEW_MAX_HEIGHT,
        }}
      >
        {mode === "crop" ? (
          <ReactCrop crop={crop} onChange={(c) => setCrop(c)} onComplete={(c) => setCompletedCrop(c)}>
            <img
              ref={imgRef}
              src={currentImageSrc}
              style={{ maxHeight: PREVIEW_MAX_HEIGHT, maxWidth: "100%", objectFit: "contain" }}
              alt="Crop preview"
            />
          </ReactCrop>
        ) : (
          <Stage
            width={layout?.width ?? 0}
            height={layout?.height ?? 0}
            onMouseDown={handleMouseDown}
            onMousemove={handleMouseMove}
            onMouseup={handleMouseUp}
            onTouchStart={handleMouseDown}
            onTouchMove={handleMouseMove}
            onTouchEnd={handleMouseUp}
            ref={stageRef}
            style={{
              cursor: mode === "draw" ? "crosshair" : "default",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            }}
          >
            <Layer>
              {/* Image and annotations share one Group so rotation and flip
                  move them together and shape coords stay in image space. */}
              <Group
                ref={groupRef}
                x={layout?.x ?? 0}
                y={layout?.y ?? 0}
                rotation={rotation}
                scaleX={layout?.scaleX ?? 1}
                scaleY={layout?.scaleY ?? 1}
              >
                {image && <KonvaImage image={image} width={image.width} height={image.height} />}
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
                  }
                  if (shape.type === "line" && shape.points.length >= 4) {
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
                  }
                  if (shape.type === "arrow" && shape.points.length >= 4) {
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
                  }
                  if (shape.type === "circle" && shape.points.length >= 4) {
                    const [startX, startY, endX, endY] = shape.points;
                    const radiusX = Math.abs(endX - startX) / 2;
                    const radiusY = Math.abs(endY - startY) / 2;
                    return (
                      <Ellipse
                        key={i}
                        x={Math.min(startX, endX) + radiusX}
                        y={Math.min(startY, endY) + radiusY}
                        radiusX={radiusX}
                        radiusY={radiusY}
                        stroke={shape.color}
                        strokeWidth={shape.size}
                      />
                    );
                  }
                  if (shape.type === "text") {
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
              </Group>
            </Layer>
          </Stage>
        )}
      </div>
    </div>
  );
};
