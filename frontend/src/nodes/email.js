import React, { useState } from "react";
import BaseNode from "../components/baseNode";
import { Tooltip, TextField } from "@mui/material";
import { ReactComponent as MailIcon } from "../Assets/MailIcon.svg";

export const EmailFormatterNode = ({ id, data }) => {
  const [emailFormat, setEmailFormat] = useState(data?.emailFormat || "{name}@example.com");

  const renderContent = () => (
    <div>
      <Tooltip title="Specify the email format using placeholders like {name}">
        <TextField
          label="Email Format"
          variant="outlined"
          fullWidth
          size="small"
          value={emailFormat}
          onChange={(e) => setEmailFormat(e.target.value)}
          placeholder="{name}@example.com"
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
      title="Email Formatter"
      description="Format email addresses dynamically."
      handles={[
        { type: "target", position: "left", id: `${id}-input` },
        { type: "source", position: "right", id: `${id}-output` },
      ]}
      renderContent={renderContent}
      Icon={MailIcon}
    />
  );
};

export default EmailFormatterNode;
