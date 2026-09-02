import { Handle, Position } from "reactflow";
import type { CSSProperties } from "react";
import type { NodeHandleSpec } from "../types/editor";

const NodeHandle = ({ id, type, position, style }: NodeHandleSpec) => {
  const defaultStyle: CSSProperties = {
    background: "white", // Black fill
    border: "1px solid black", // Black border
    borderRadius: "50%", // Circular shape
    width: "10px", // Size of the handle
    height: "10px", // Size of the handle
    position: "absolute", // Ensures absolute positioning
    right : "-5px",
  };

  return (
    <Handle
      id={id}
      type={type}
      position={position === "right" ? Position.Right : position === "left" ? Position.Left : position}
      style={{
        ...defaultStyle,
        ...style,
      }}
    />
  );
};

export default NodeHandle;
