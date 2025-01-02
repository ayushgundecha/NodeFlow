import { useStore } from './store';
import { Button, Box, Snackbar, Alert } from '@mui/material';
import { useState } from 'react';



export const SubmitButton = () => {
    const { nodes, edges } = useStore();
    const [notification, setNotification] = useState({ open: false, message: '', severity: 'info' });

    const API_URL = window.location.origin;

    const handleSubmit = async () => {
        try {
            const response = await fetch(`${API_URL}/pipelines/parse`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nodes, edges }),
            });

            const result = await response.json();
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

    const handleClose = (_, reason) => {
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
                    onClick={handleSubmit}
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
