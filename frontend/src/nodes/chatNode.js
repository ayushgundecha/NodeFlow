import BaseNode from "./baseNode";

const ChatNode = ({id, data}) => {

    const renderContent = () => {
        <div className="space-y-4">

        </div>
    };


    return(
        <BaseNode
            key={id}
            title="Chat Node"
            description="This is the Chat Node"
            handles={[
                { type: "target", position: "left", id: `${id}-input` },
                { type: "source", position: "right", id: `${id}-output` },
              ]}
            renderContent={renderContent}
        />
    );
};


export default ChatNode;