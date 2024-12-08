import React, { useState } from "react";
import BaseNode from "./baseNode";
import { Tooltip, Select, MenuItem, FormControl, InputLabel } from "@mui/material";
import { ReactComponent as TextIcon } from "../Assets/InputIcon.svg";

export const TextTransformationNode = ({ id, data }) => {
  const [transformation, setTransformation] = useState(data?.transformation || "uppercase");

  const renderContent = () => (
    <div>
      <Tooltip title="Choose a text transformation">
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
      Icon={TextIcon}
    />
  );
};

export default TextTransformationNode;
