import React, { useState, useEffect } from "react";
import { TextField, Tooltip } from "@mui/material";
import { Position } from "reactflow";
import BaseNode from "../components/baseNode";
import { ReactComponent as TextIcon } from "../Assets/DocumentTextIcon.svg";

export const TextNode = ({ id, data }) => {
  const [currText, setCurrText] = useState(data?.text || "{{input}}");
  const [variableHandles, setVariableHandles] = useState([]);

  // Helper function to extract variables surrounded by double curly brackets
  const extractVariables = (text) => {
    const regex = /\{\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\}\}/g;
    const matches = Array.from(text.matchAll(regex)).map((match) => match[1]);
    return Array.from(new Set(matches)); // Remove duplicates
  };

  // Update handles whenever the text changes
  useEffect(() => {
    const variables = extractVariables(currText);
    const newHandles = variables.map((variable) => ({
      type: "target",
      position: Position.Left,
      id: `${id}-${variable}`,
      style: { top: `${30 + variableHandles.length * 20}px` }, // Adjusts handle positioning
    }));
    setVariableHandles(newHandles);
  }, [currText]);

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
        ...variableHandles, // Add dynamically generated variable handles
      ]}
      Icon={TextIcon}
    />
  );
};

export default TextNode;
