import React, { useState } from "react";
import { Position } from "reactflow";
import BaseNode from "../components/baseNode";
import { TextField, Select, MenuItem, FormControl, InputLabel, Tooltip } from "@mui/material";
import { ReactComponent as InputIcon } from "../Assets/InputIcon.svg";

export const InputNode = ({ id, data }) => {
  const [currName, setCurrName] = useState(data?.inputName || `input_${id.replace("customInput-", "")}`);
  const [inputType, setInputType] = useState(data?.inputType || "Text");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const renderContent = () => (
    <div className="space-y-4">
      {/* Field Name Input */}
      <div>
        <Tooltip title="Enter the field name" disableHoverListener={dropdownOpen}>
          <TextField
            label="Field Name"
            variant="outlined"
            fullWidth
            size="small"
            value={currName}
            onChange={(e) => setCurrName(e.target.value)}
            sx={{
              '& .MuiInputBase-input': { fontSize: '14px' }, // Input text
              '& .MuiInputLabel-root': { fontSize: '14px' }, // Label text
            }}
          />
        </Tooltip>
      </div>

      {/* Input Type Dropdown */}
      <div>
        <Tooltip title="Select the input type" disableHoverListener={dropdownOpen}>
          <FormControl
            fullWidth
            size="small"
            variant="outlined"
            sx={{
              "& .MuiInputBase-input": { fontSize: "14px" }, // Consistent font size for input
              "& .MuiInputLabel-root": { fontSize: "14px" }, // Consistent font size for label
              "& .MuiMenuItem-root": { fontSize: "14px" }, // Consistent font size for dropdown items
            }}
          >
            <InputLabel id={`${id}-type-label`}>Type</InputLabel>
            <Select
              labelId={`${id}-type-label`}
              id={`${id}-type`}
              value={inputType}
              onChange={(e) => setInputType(e.target.value)}
              label="Type"
              className="nodrag"
              onOpen={() => setDropdownOpen(true)}
              onClose={() => setDropdownOpen(false)}
              MenuProps={{
                PaperProps: {
                  sx: {
                    maxHeight: 200, // Dropdown height
                    width: 150, // Dropdown width
                  },
                },
              }}
            >
              {/* Menu Items */}
              <MenuItem value="Text">Text</MenuItem>
              <MenuItem value="File">File</MenuItem>
            </Select>
          </FormControl>
        </Tooltip>
      </div>
    </div>
  );

  return (
    <BaseNode
      id={id}
      title="Input"
      description="Define input properties"
      handles={[{ type: "source", position: Position.Right, id: `${id}-value` }]}
      renderContent={renderContent}
      Icon={InputIcon}
    />
  );
};

export default InputNode;
