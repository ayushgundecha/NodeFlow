import React from "react";
import { Handle, Position } from "reactflow";

const NodeHandle = ({ id, type, position, style }) => {
  const defaultStyle = {
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
      position={position === "right" ? Position.Right : Position.Left}
      style={{
        ...defaultStyle,
        ...style,
      }}
    />
  );
};

export default NodeHandle;
