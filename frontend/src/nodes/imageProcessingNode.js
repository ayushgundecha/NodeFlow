// src/nodes/ImageProcessingNode.js
import React, { useState } from "react";
import { TextField, Select, MenuItem, FormControl, InputLabel, Tooltip, Button } from "@mui/material";
import BaseNode from "../components/baseNode";
import { ReactComponent as PhotographIcon } from "../Assets/PhotographIcon.svg";

export const ImageProcessingNode = ({ id, data }) => {
  const [fields, setFields] = useState(data?.fields || {});
  const [dropdownOpen, setDropdownOpen] = useState(false);
  

  // Update field values
  const handleFieldChange = (fieldName, value) => {
    setFields((prevFields) => ({
      ...prevFields,
      [fieldName]: value,
    }));
  };

  // Handle file upload
  const handleFileChange = (e) => {
    const file = e.target.files.length ? e.target.files[0] : null;
    handleFieldChange("image", file);
  };

  // Render node content
  const renderContent = () => (
    <div className="space-y-4">
      {/* Upload Image */}
      <div>
        <Tooltip title="Upload an image to process">
          <Button
            variant="contained"
            component="label"
            size="small"
            sx={{ fontSize: "10px" }}
          >
            Upload Image
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={handleFileChange}
              aria-label="Upload Image"
            />
          </Button>
        </Tooltip>
      </div>

      {/* Processing Type */}
      <div>
        <Tooltip title="Select the type of processing" disableHoverListener={dropdownOpen}>
          <FormControl fullWidth size="small">
            <InputLabel
              id={`${id}-processingType-label`}
              sx={{ fontSize: "14px" }}
            >
              Processing Type
            </InputLabel>
            <Select
              labelId={`${id}-processingType-label`}
              id={`${id}-processingType`}
              value={fields.processingType || "Filter"}
              onChange={(e) => handleFieldChange("processingType", e.target.value)}
              label="Processing Type"
              sx={{ fontSize: "14px" }}
              MenuProps={{
                PaperProps: {
                  style: { maxHeight: 200 },
                },
              }}
              onOpen={() => setDropdownOpen(true)}
              onClose={() => setDropdownOpen(false)}
              className="nodrag"
            >
              <MenuItem value="Resize" sx={{ fontSize: "14px" }}>
                Resize
              </MenuItem>
              <MenuItem value="Filter" sx={{ fontSize: "14px" }}>
                Filter
              </MenuItem>
              <MenuItem value="Compress" sx={{ fontSize: "14px" }}>
                Compress
              </MenuItem>
            </Select>
          </FormControl>
        </Tooltip>
      </div>

      {/* Conditional rendering for Resize options */}
      {fields.processingType === "Resize" && (
        <div className="flex space-x-4">
          <div>
            <Tooltip title="Enter the desired width in pixels">
              <TextField
                label="Width (px)"
                variant="outlined"
                size="small"
                fullWidth
                value={fields.width || ""}
                onChange={(e) => handleFieldChange("width", e.target.value)}
                placeholder="e.g., 1920"
                sx={{
                  "& .MuiInputBase-input": { fontSize: "14px" },
                  "& .MuiInputLabel-root": { fontSize: "14px" },
                }}
              />
            </Tooltip>
          </div>

          <div>
            <Tooltip title="Enter the desired height in pixels">
              <TextField
                label="Height (px)"
                variant="outlined"
                size="small"
                fullWidth
                value={fields.height || ""}
                onChange={(e) => handleFieldChange("height", e.target.value)}
                placeholder="e.g., 1080"
                sx={{
                  "& .MuiInputBase-input": { fontSize: "14px" },
                  "& .MuiInputLabel-root": { fontSize: "14px" },
                }}
              />
            </Tooltip>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <BaseNode
      id={id}
      title="Image Processing"
      description="Resize, filter, or compress images."
      renderContent={renderContent}
      handles={[
        { type: "target", position: "left", id: `${id}-input` },
        { type: "source", position: "right", id: `${id}-output` },
      ]}
      Icon={PhotographIcon}
    />
  );
};

export default ImageProcessingNode;