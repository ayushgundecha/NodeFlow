import React, { useState } from "react";
import { TextField, Select, MenuItem, FormControl, InputLabel, Tooltip } from "@mui/material";
import BaseNode from "./baseNode";
import { ReactComponent as CodeIcon } from "../Assets/CodeIcon.svg";

export const ApiFetchNode = ({ id, data }) => {
  const { fields = {}, updateField } = data || {};
  const [dropdownOpen, setDropdownOpen] = useState(false);


  // Generic change handler
  const handleFieldChange = (fieldName, value) => {
    if (updateField) {
      updateField(fieldName, value);
    }
  };

  // JSON validation helper
  const handleJsonFieldChange = (fieldName, value) => {
    try {
      JSON.parse(value); // Validate JSON format
      handleFieldChange(fieldName, value);
    } catch (err) {
      console.error("Invalid JSON:", err); // Log errors for debugging
    }
  };

  const renderContent = () => (
    <div className="space-y-4">
      {/* API URL */}
      <div>
        <Tooltip title="Enter the API endpoint URL" >
          <TextField
            label="API URL"
            variant="outlined"
            fullWidth
            size="small"
            value={fields.apiUrl || ""}
            onChange={(e) => handleFieldChange("apiUrl", e.target.value)}
            placeholder="https://example.com/api"
            sx={{
              '& .MuiInputBase-input': { fontSize: '14px' }, // Input text
              '& .MuiInputLabel-root': { fontSize: '14px' }, // Label text
            }}
          />
        </Tooltip>
      </div>

      {/* HTTP Method */}
      <div>
        <Tooltip title="Select the HTTP method"  disableHoverListener={dropdownOpen}>
          <FormControl fullWidth size="small">
            <InputLabel
              id={`${id}-method-label`}
              sx={{ fontSize: "14px" }}
            >
              HTTP Method
            </InputLabel>
            <Select
              labelId={`${id}-method-label`}
              id={`${id}-method`}
              value={fields.method || "GET"}
              onChange={(e) => handleFieldChange("method", e.target.value)}
              label="HTTP Method"
              sx={{
                fontSize: "14px",
              }}
              MenuProps={{
                PaperProps: {
                  style: {
                    maxHeight: 200, // Limit dropdown height
                  },
                },
              }}
              onOpen={() => setDropdownOpen(true)}
              onClose={() => setDropdownOpen(false)}
              className="nodrag"
            >
              <MenuItem value="GET" sx={{ fontSize: "14px" }}>
                GET
              </MenuItem>
              <MenuItem value="POST" sx={{ fontSize: "14px" }}>
                POST
              </MenuItem>
              <MenuItem value="PUT" sx={{ fontSize: "14px" }}>
                PUT
              </MenuItem>
              <MenuItem value="DELETE" sx={{ fontSize: "14px" }}>
                DELETE
              </MenuItem>
            </Select>
          </FormControl>
        </Tooltip>
      </div>

      {/* Headers */}
      <div>
        <Tooltip title="Enter JSON headers" >
          <TextField
            label="Headers (JSON)"
            multiline
            minRows={4}
            variant="outlined"
            fullWidth
            size="small"
            value={fields.headers || ""}
            onChange={(e) => handleJsonFieldChange("headers", e.target.value)}
            placeholder='{"Authorization": "Bearer token"}'
            sx={{
              '& .MuiInputBase-input': { fontSize: '14px' }, // Input text
              '& .MuiInputLabel-root': { fontSize: '14px' }, // Label text
            }}
          />
        </Tooltip>
      </div>

      {/* Body */}
      <div>
        <Tooltip title="Enter JSON body" >
          <TextField
            label="Body (JSON)"
            multiline
            minRows={4}
            variant="outlined"
            fullWidth
            size="small"
            value={fields.body || ""}
            onChange={(e) => handleJsonFieldChange("body", e.target.value)}
            placeholder='{"key": "value"}'
            sx={{
              '& .MuiInputBase-input': { fontSize: '14px' }, // Input text
              '& .MuiInputLabel-root': { fontSize: '14px' }, // Label text
            }}
          />
        </Tooltip>
      </div>
    </div>
  );

  return (
    <BaseNode
      id={id}
      title="API Fetch"
      description="Fetch data from an external API."
      renderContent={renderContent}
      handles={[
        { type: "target", position: "left", id: `${id}-input` },
        { type: "source", position: "right", id: `${id}-output` },
      ]}
      Icon={CodeIcon}
    />
  );
};

export default ApiFetchNode;
