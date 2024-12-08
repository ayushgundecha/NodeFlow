import React, { useState } from "react";
import BaseNode from "../components/baseNode";
import { Tooltip, Select, MenuItem, FormControl, InputLabel } from "@mui/material";
import { ReactComponent as TransformIcon } from "../Assets/TransformIcon.svg";

export const TextTransformationNode = ({ id, data }) => {
  const [transformation, setTransformation] = useState(data?.transformation || "uppercase");
  const [dropdownOpen, setDropdownOpen] = useState(false);


  const renderContent = () => (
    <div>
      <Tooltip title="Choose a text transformation" disableHoverListener={dropdownOpen}>
        <FormControl fullWidth size="small" variant="outlined">
          <InputLabel id={`${id}-transformation-label`} sx={{ fontSize: "14px" }}>
            Transformation
          </InputLabel>
          <Select
            labelId={`${id}-transformation-label`}
            id={`${id}-transformation`}
            value={transformation}
            onChange={(e) => setTransformation(e.target.value)}
            label="Transformation"
            sx={{ fontSize: "14px" }}
            onOpen={() => setDropdownOpen(true)}
            onClose={() => setDropdownOpen(false)}
            className="nodrag"
          >
            <MenuItem value="uppercase">Uppercase</MenuItem>
            <MenuItem value="lowercase">Lowercase</MenuItem>
            <MenuItem value="capitalize">Capitalize</MenuItem>
          </Select>
        </FormControl>
      </Tooltip>
    </div>
  );

  return (
    <BaseNode
      id={id}
      title="Text Transformation"
      description="Apply transformations to text."
      handles={[
        { type: "target", position: "left", id: `${id}-input` },
        { type: "source", position: "right", id: `${id}-output` },
      ]}
      renderContent={renderContent}
      Icon={TransformIcon}
    />
  );
};

export default TextTransformationNode;
