// src/nodes/ImageProcessingNode.js
import { useState } from "react";
import type { ChangeEvent } from "react";
import type { NodeProps } from "reactflow";
import { TextField, Select, MenuItem, FormControl, InputLabel, Tooltip, Button } from "@mui/material";
import BaseNode from "../components/baseNode";
import PhotographIcon from "../Assets/PhotographIcon.svg?react";
import type { FlowNodeData } from "../types/editor";
import { useEditorStore } from "../features/editor/editorStore";
import { useNodeField } from "../features/editor/useNodeField";

type ProcessingType = "Resize" | "Filter" | "Compress";

export const ImageProcessingNode = ({ id }: NodeProps<FlowNodeData>) => {
  const [processingType, setProcessingType] = useNodeField<ProcessingType>(
    id,
    "processingType",
    "Filter",
  );
  const [width, setWidth] = useNodeField(id, "width", "");
  const [height, setHeight] = useNodeField(id, "height", "");
  const uploadedFile = useEditorStore((state) => state.uploadedFiles.get(id));
  const setUploadedFile = useEditorStore((state) => state.setUploadedFile);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Handle file upload
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setUploadedFile(id, file);
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
        {uploadedFile ? <span className="ml-2 text-xs text-gray-600">{uploadedFile.name}</span> : null}
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
              value={processingType}
              onChange={(e) => { setProcessingType(e.target.value as ProcessingType); }}
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
      {processingType === "Resize" && (
        <div className="flex space-x-4">
          <div>
            <Tooltip title="Enter the desired width in pixels">
              <TextField
                label="Width (px)"
                variant="outlined"
                size="small"
                fullWidth
                value={width}
                onChange={(e) => { setWidth(e.target.value); }}
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
                value={height}
                onChange={(e) => { setHeight(e.target.value); }}
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
