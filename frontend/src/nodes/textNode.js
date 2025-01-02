import React, { useState } from "react";
import { TextField, Tooltip } from "@mui/material";
import { Position } from "reactflow";
import BaseNode from "../components/baseNode";
import { ReactComponent as TextIcon } from "../Assets/DocumentTextIcon.svg";

export const TextNode = ({ id, data }) => {
  const [currText, setCurrText] = useState(data?.text || "");

  const handleTextChange = (e) => {
    setCurrText(e.target.value);
  };

  const renderContent = () => (
    <div className="space-y-4">
      <Tooltip title="Enter the text value">
        <TextField
          label="Text"
          variant="outlined"
          fullWidth
          size="small"
          multiline
          minRows={2}
          value={currText}
          onChange={handleTextChange}
          sx={{
            "& .MuiInputBase-input": { fontSize: "14px" }, // Input text styling
            "& .MuiInputLabel-root": { fontSize: "14px" }, // Label text styling
          }}
          placeholder="Enter text"
        />
      </Tooltip>
    </div>
  );

  return (
    <BaseNode
      id={id}
      title="Text"
      description="Set a text value."
      renderContent={renderContent}
      handles={[
        { type: "source", position: Position.Right, id: `${id}-output`, style: { top: "50%" } },
        { type: 'target', position: Position.left, id: `${id}-input`, style: { top: '50%' } },
      ]}
      Icon={TextIcon}
    />
  );
};

export default TextNode;
