// toolbar.js
import { DraggableNode } from './draggableNode';
import InputIcon from "./Assets/InputIcon.svg?react";
import ChipIcon from "./Assets/ChipIcon.svg?react";
import OutputIcon from "./Assets/OutputIcon.svg?react";
import DocumentTextIcon from "./Assets/DocumentTextIcon.svg?react";
import CodeIcon from "./Assets/CodeIcon.svg?react";
import PhotographIcon from "./Assets/PhotographIcon.svg?react";
import TimerIcon from "./Assets/ClockIcon.svg?react";
import MailIcon from "./Assets/MailIcon.svg?react";
import TransformIcon from "./Assets/TransformIcon.svg?react";


export const PipelineToolbar = () => {
    return (
        <div className="p-4 bg-white shadow-md rounded-lg">
            <div className="mt-4 flex flex-wrap gap-4 justify-center">
                <DraggableNode type="customInput" label="Input" IconComponent={InputIcon} iconColor="#EF4444" /> {/* Red */}
                <DraggableNode type="llm" label="LLM" IconComponent={ChipIcon} iconColor="#10B981" /> {/* Green */}
                <DraggableNode type="customOutput" label="Output" IconComponent={OutputIcon} iconColor="#8B5CF6" /> {/* Purple */}
                <DraggableNode type="text" label="Text" IconComponent={DocumentTextIcon} iconColor="#F59E0B" /> {/* Yellow */}
                <DraggableNode type="api" label="API" IconComponent={CodeIcon} iconColor="#EC4899" /> {/* Pink */}
                <DraggableNode type="imageProcessing" label="Image" IconComponent={PhotographIcon} iconColor="#3B82F6" /> {/* Blue */}
                <DraggableNode type="timer" label="Timer" IconComponent={TimerIcon} iconColor="#7C3AED" /> {/* Violet */}
                <DraggableNode type="emailFormatter" label="Email Formatter" IconComponent={MailIcon} iconColor="#F87171" /> {/* Light Red */}
                <DraggableNode type="textTransformation" label="Transformation" IconComponent={TransformIcon} iconColor="#34D399" /> {/* Light Green */}
            </div>
        </div>
    );
};
