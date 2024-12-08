import React, { useState } from "react";
import BaseNode from "./baseNode";
import { TextField, Tooltip } from "@mui/material";
import { ReactComponent as DocumentTextIcon } from "../Assets/DocumentTextIcon.svg";

export const TextNode = ({ id, data }) => {
  const [currText, setCurrText] = useState(data?.text || "{{input}}");

  return (
    <BaseNode
      id={id}
      title="Text"
      description="Render text output"
      handles={[{ type: "source", position: "right", id: `${id}-output` }]}
      renderContent={() => (
        <div className="space-y-4">
          {/* Text Area */}
          <Tooltip title="Enter the text content" >
            <TextField
              label="Text"
              multiline
              rows={4} // Adjust the height of the textarea
              fullWidth
              size="small"
              variant="outlined"
              value={currText}
              onChange={(e) => setCurrText(e.target.value)}
              sx={{
                '& .MuiInputBase-input': { fontSize: '14px' }, // Input text
                '& .MuiInputLabel-root': { fontSize: '14px' }, // Label text
              }}
            />
          </Tooltip>
        </div>
      )}
      Icon={DocumentTextIcon}
    />
  );
};

export default TextNode;
