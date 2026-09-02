import { useStore } from './store';
import { Button, Box, Snackbar, Alert } from '@mui/material';
import type { AlertColor, SnackbarCloseReason } from '@mui/material';
import type { SyntheticEvent } from 'react';
import { useState } from 'react';

type ParsePipelineResponse = {
    num_nodes: number;
    num_edges: number;
    is_dag: boolean;
};

type Notification = {
    open: boolean;
    message: string;
    severity: AlertColor;
};

export const SubmitButton = () => {
    const nodes = useStore((state) => state.nodes);
    const edges = useStore((state) => state.edges);
    const [notification, setNotification] = useState<Notification>({ open: false, message: '', severity: 'info' });

    const handleSubmit = async () => {
        try {
            const response = await fetch('/api/v1/pipelines/parse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nodes, edges }),
            });

            if (!response.ok) {
                throw new Error(`Pipeline validation failed with status ${response.status}.`);
            }

            const result = await response.json() as ParsePipelineResponse;
            const { num_nodes, num_edges, is_dag } = result;

            setNotification({
                open: true,
                message: `Nodes: ${num_nodes}, Edges: ${num_edges}, Is DAG: ${is_dag}`,
                severity: 'success',
            });
        } catch (error) {
            console.error('Error submitting pipeline:', error);
            setNotification({
                open: true,
                message: 'Failed to submit the pipeline. Please try again.',
                severity: 'error',
            });
        }
    };

    const handleClose = (_event: Event | SyntheticEvent, reason?: SnackbarCloseReason) => {
        if (reason === 'clickaway') return;
        setNotification({ ...notification, open: false });
    };

    return (
        <>
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mt: 2,
                }}
            >
                <Button
                    variant="contained"
                    onClick={() => { void handleSubmit(); }}
                    sx={{
                        textTransform: 'none',
                        backgroundColor: '#f5f5f5',
                        color: '#333',
                        fontWeight: '700',
                        fontFamily : 'monospace',
                        padding: '8px 20px',
                        fontSize: '16px',
                        border: '1px solid #ddd',
                        boxShadow: '0 2px 5px rgba(0, 0, 0, 0.05)',
                        '&:hover': {
                            backgroundColor: '#e8e8e8',
                            boxShadow: '0 3px 8px rgba(0, 0, 0, 0.1)',
                        },
                        borderRadius: '8px',
                        transition: 'all 0.2s ease',
                    }}
                >
                    Submit Pipeline
                </Button>
            </Box>
            <Snackbar
                open={notification.open}
                autoHideDuration={4000}
                onClose={handleClose}
                anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
            >
                <Alert
                    onClose={handleClose}
                    severity={notification.severity}
                    sx={{ width: '100%' }}
                >
                    {notification.message}
                </Alert>
            </Snackbar>
        </>
    );
};
