// draggableNode.js

export const DraggableNode = ({ type, label, IconComponent, iconColor }) => {

  const onDragStart = (event, nodeType) => {
      const appData = { nodeType };
      event.target.style.cursor = 'grabbing';
      event.dataTransfer.setData('application/reactflow', JSON.stringify(appData));
      event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
        className="flex flex-col items-center justify-center w-20 h-20 rounded-lg shadow-md bg-white border border- hover:shadow-xl transition-transform transform hover:scale-105 cursor-grab"
        onDragStart={(event) => onDragStart(event, type)}
        onDragEnd={(event) => (event.target.style.cursor = 'grab')}
        draggable
    >
        {IconComponent && <IconComponent className="w-6 h-6 mb-2" fill={iconColor} />}
        <span className="text-sm font-medium text-black">{label}</span>
    </div>
);
};