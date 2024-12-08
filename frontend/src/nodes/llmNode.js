import React from 'react';
import BaseNode from "../components/baseNode";
import { ReactComponent as ChipIcon } from "../Assets/ChipIcon.svg";

export const LLMNode = ({ id }) => {
  return (
    <BaseNode
      id={id}
      title="LLM"
      description="Process prompts using AI"
      handles={[
        { type: 'target', position: 'left', id: `${id}-system`, style: { top: '30%' } },
        { type: 'target', position: 'left', id: `${id}-prompt`, style: { top: '70%' } },
        { type: 'source', position: 'right', id: `${id}-response`, style: { top: '50%' } },
      ]}
      
      renderContent={() => (
        <span className="text-xs text-gray-600">This node represents an LLM.</span>
      )}
      Icon={ChipIcon}
    />
  );
};
