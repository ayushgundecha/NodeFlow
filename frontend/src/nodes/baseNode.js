import React from "react";
import NodeHandle from "./nodeHandle";
import { Tooltip } from "@mui/material";
import { ReactComponent as Cancel } from "../Assets/cancel.svg";

const BaseNode = ({ id, title, description = "", handles = [], renderContent = null, Icon }) => {
  return (
    <div
      className="relative w-auto min-w-[300px] max-w-[400px] p-5 rounded-3xl shadow-lg border border-gray-300 bg-gray-50 
      hover:bg-gray-100 hover:shadow-xl hover:border-blue-400 transition-all duration-300 transform hover:-translate-y-1"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-lg font-semibold text-blue-800">
          {Icon && <Icon className="w-6 h-6 text-blue-500" />}
          {title}
        </div>
        <Tooltip title="Delete Node">
          <button
            className="p-2 rounded-full text-gray-500 hover:text-red-500 hover:bg-red-100 transition-all duration-300 delete-button"
          >
            <Cancel className="w-5 h-5 fill-current" />
          </button>
        </Tooltip>
      </div>

      {description && <div className="text-sm text-gray-600 mb-4">{description}</div>}

      {renderContent && <div className="flex flex-col gap-3">{renderContent()}</div>}

      <div className="flex flex-wrap gap-2">
        {handles.map((handle, index) => (
          <NodeHandle key={index} {...handle} />
        ))}
      </div>
    </div>
  );
};

export default BaseNode;
