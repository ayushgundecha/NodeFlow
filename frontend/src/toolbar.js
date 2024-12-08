// toolbar.js
import { DraggableNode } from './draggableNode';
import { ReactComponent as InputIcon } from "./Assets/InputIcon.svg";
import { ReactComponent as ChipIcon } from "./Assets/ChipIcon.svg";
import { ReactComponent as OutputIcon } from "./Assets/OutputIcon.svg";
import { ReactComponent as DocumentTextIcon } from "./Assets/DocumentTextIcon.svg";
import { ReactComponent as CodeIcon } from "./Assets/CodeIcon.svg";
import { ReactComponent as PhotographIcon } from "./Assets/PhotographIcon.svg";


export const PipelineToolbar = ({ id }) => {
    return (
        <div className="p-4 bg-white shadow-md rounded-lg">
            <div className="mt-4 flex flex-wrap gap-4 justify-center">
                <DraggableNode type="customInput" label="Input" IconComponent={InputIcon} iconColor="#EF4444" /> {/* Red */}
                <DraggableNode type="llm" label="LLM" IconComponent={ChipIcon} iconColor="#10B981" /> {/* Green */}
                <DraggableNode type="customOutput" label="Output" IconComponent={OutputIcon} iconColor="#8B5CF6" /> {/* Purple */}
                <DraggableNode type="text" label="Text" IconComponent={DocumentTextIcon} iconColor="#F59E0B" /> {/* Yellow */}
                <DraggableNode type="api" label="API" IconComponent={CodeIcon} iconColor="#EC4899" /> {/* Pink */}
                <DraggableNode type="imageProcessing" label="Image" IconComponent={PhotographIcon} iconColor="#3B82F6" /> {/* Blue */}
                <DraggableNode type="timer" label="Timer" IconComponent={CodeIcon} iconColor="#7C3AED" /> {/* Violet */}
                <DraggableNode type="emailFormatter" label="Email Formatter" IconComponent={CodeIcon} iconColor="#F87171" /> {/* Light Red */}
                <DraggableNode type="textTransformation" label="Transformation" IconComponent={CodeIcon} iconColor="#34D399" /> {/* Light Green */}
            </div>
        </div>
    );
};
