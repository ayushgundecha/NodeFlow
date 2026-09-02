import { useState } from "react";
import type { NodeProps } from "reactflow";
import { TextField, Select, MenuItem, FormControl, InputLabel, Tooltip } from "@mui/material";
import BaseNode from "../components/baseNode";
import CodeIcon from "../Assets/CodeIcon.svg?react";
import type { FlowNodeData } from "../types/editor";
import { useNodeField } from "../features/editor/useNodeField";

export const ApiFetchNode = ({ id }: NodeProps<FlowNodeData>) => {
  const [apiUrl, setApiUrl] = useNodeField(id, "apiUrl", "");
  const [method, setMethod] = useNodeField(id, "method", "GET");
  const [headers, setHeaders] = useNodeField(id, "headers", "");
  const [body, setBody] = useNodeField(id, "body", "");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Render the node content
  const renderContent = () => (
    <div className="space-y-4">
      {/* API URL */}
      <div>
        <Tooltip title="Enter the API endpoint URL">
          <TextField
            label="API URL"
            variant="outlined"
            fullWidth
            size="small"
            value={apiUrl}
            onChange={(e) => { setApiUrl(e.target.value); }}
            placeholder="https://example.com/api"
            sx={{
              '& .MuiInputBase-input': { fontSize: '14px' },
              '& .MuiInputLabel-root': { fontSize: '14px' },
            }}
          />
        </Tooltip>
      </div>

      {/* HTTP Method */}
      <div>
        <Tooltip title="Select the HTTP method" disableHoverListener={dropdownOpen}>
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
              value={method}
              onChange={(e) => { setMethod(e.target.value); }}
              label="HTTP Method"
              sx={{ fontSize: "14px" }}
              MenuProps={{
                PaperProps: {
                  style: { maxHeight: 200 }, // Limit dropdown height
                },
              }}
              onOpen={() => setDropdownOpen(true)}
              onClose={() => setDropdownOpen(false)}
              className="nodrag"
            >
              {["GET", "POST", "PUT", "DELETE"].map((method) => (
                <MenuItem key={method} value={method} sx={{ fontSize: "14px" }}>
                  {method}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Tooltip>
      </div>

      {/* Headers */}
      <div>
        <Tooltip title="Enter JSON headers">
          <TextField
            label="Headers (JSON)"
            multiline
            minRows={4}
            variant="outlined"
            fullWidth
            size="small"
            value={headers}
            onChange={(e) => { setHeaders(e.target.value); }}
            placeholder='{"Authorization": "Bearer token"}'
            sx={{
              '& .MuiInputBase-input': { fontSize: '14px' },
              '& .MuiInputLabel-root': { fontSize: '14px' },
            }}
          />
        </Tooltip>
      </div>

      {/* Body */}
      <div>
        <Tooltip title="Enter JSON body">
          <TextField
            label="Body (JSON)"
            multiline
            minRows={4}
            variant="outlined"
            fullWidth
            size="small"
            value={body}
            onChange={(e) => { setBody(e.target.value); }}
            placeholder='{"key": "value"}'
            sx={{
              '& .MuiInputBase-input': { fontSize: '14px' },
              '& .MuiInputLabel-root': { fontSize: '14px' },
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
