import React from "react";
import { Handle, Position } from "reactflow";

const NodeHandle = ({ id, type, position, style }) => {
  const defaultStyle = {
    background: "linear-gradient(90deg, rgba(33, 150, 243, 1) 0%, rgba(0, 212, 255) 100%)",
    borderRadius: "50%",
    boxShadow: "0 0 10px rgba(33, 150, 243, 0.8)",
    animation: "pulse 1.5s infinite",
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
