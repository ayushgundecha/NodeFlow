import React from "react";
import { Handle } from "reactflow";

const NodeHandle = ({ id, type, position }) => {
  return (
    <Handle
      id={id}
      type={type}
      position={position}
      style={{
        
       
      }}
    />
  );
};

export default NodeHandle;
