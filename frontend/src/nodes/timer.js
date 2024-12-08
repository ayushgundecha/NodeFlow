import React, { useState } from "react";
import BaseNode from "../components/baseNode";
import { Tooltip, TextField } from "@mui/material";
import { ReactComponent as ClockIcon } from "../Assets/ClockIcon.svg";

export const TimerNode = ({ id, data }) => {
  const [delay, setDelay] = useState(data?.delay || 0);

  const renderContent = () => (
    <div>
      <Tooltip title="Set the delay in milliseconds">
        <TextField
          label="Delay (ms)"
          variant="outlined"
          fullWidth
          size="small"
          value={delay}
          onChange={(e) => setDelay(e.target.value)}
          type="number"
          inputProps={{ min: 0 }}
          sx={{
            '& .MuiInputBase-input': { fontSize: '14px' },
            '& .MuiInputLabel-root': { fontSize: '14px' },
          }}
        />
      </Tooltip>
    </div>
  );

  return (
    <BaseNode
      id={id}
      title="Timer/Delay"
      description="Add a delay to the flow."
      handles={[
        { type: "target", position: "left", id: `${id}-input` },
        { type: "source", position: "right", id: `${id}-output` },
      ]}
      renderContent={renderContent}
      Icon={ClockIcon}
    />
  );
};

export default TimerNode;
