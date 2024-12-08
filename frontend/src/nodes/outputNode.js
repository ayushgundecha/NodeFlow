import React, { useState } from "react";
import BaseNode from "./baseNode";
import { TextField, Select, MenuItem, FormControl, InputLabel, Tooltip } from "@mui/material";
import { ReactComponent as OutputIcon } from "../Assets/OutputIcon.svg";

export const OutputNode = ({ id, data }) => {
  const [currName, setCurrName] = useState(data?.outputName || `output_${id.replace("customOutput-", "")}`);
  const [outputType, setOutputType] = useState(data?.outputType || "Text");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const renderContent = () => (
    <div className="space-y-4">
      {/* Field Name Input */}
      <div>
        <Tooltip title="Enter the output name" disableHoverListener={dropdownOpen}>
          <TextField
            label="Output Name"
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

      {/* Output Type Dropdown */}
      <div>
        <Tooltip title="Select the output type" disableHoverListener={dropdownOpen}>
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
              value={outputType}
              onChange={(e) => setOutputType(e.target.value)}
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
              <MenuItem value="Image">Image</MenuItem>
            </Select>
          </FormControl>
        </Tooltip>
      </div>
    </div>
  );

  return (
    <BaseNode
      id={id}
      title="Output"
      description="Define output properties"
      handles={[{ type: "target", position: "left", id: `${id}-value` }]}
      renderContent={renderContent}
      Icon={OutputIcon}
    />
  );
};

export default OutputNode;
