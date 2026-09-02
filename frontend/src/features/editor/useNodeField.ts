import { useStore } from "../../store";

export const useNodeField = <Value>(
  nodeId: string,
  fieldName: string,
  fallback: Value,
): readonly [Value, (value: Value) => void] => {
  const storedValue = useStore(
    (state) => state.nodes.find((node) => node.id === nodeId)?.data[fieldName],
  );
  const updateNodeField = useStore((state) => state.updateNodeField);

  return [
    storedValue === undefined ? fallback : storedValue as Value,
    (value: Value) => { updateNodeField(nodeId, fieldName, value); },
  ] as const;
};
