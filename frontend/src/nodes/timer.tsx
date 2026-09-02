import type { NodeProps } from "reactflow";
import BaseNode from "../components/baseNode";
import { Tooltip, TextField } from "@mui/material";
import ClockIcon from "../Assets/ClockIcon.svg?react";
import type { FlowNodeData } from "../types/editor";
import { useNodeField } from "../features/editor/useNodeField";

export const TimerNode = ({ id }: NodeProps<FlowNodeData>) => {
  const [delay, setDelay] = useNodeField<string | number>(id, "delay", 0);

  const renderContent = () => (
    <div>
      <Tooltip title="Set the delay in milliseconds">
        <TextField
          label="Delay (ms)"
          variant="outlined"
          fullWidth
          size="small"
          value={delay}
          onChange={(e) => { setDelay(e.target.value); }}
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
