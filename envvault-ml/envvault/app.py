import gradio as gr
import joblib
import pandas as pd

# Load the trained model (sklearn Pipeline: StandardScaler + IsolationForest)
model = joblib.load("model.pkl")

FEATURE_COLUMNS = [
    "hour_of_day",
    "secrets_per_session",
    "user_role_encoded",
    "ip_hash",
    "action_type_encoded",
    "day_of_week",
]


def classify_confidence(abs_score):
    if abs_score > 0.3:
        return "High"
    elif abs_score > 0.15:
        return "Medium"
    return "Low"


def predict(hour_of_day, secrets_per_session, user_role_encoded, ip_hash, action_type_encoded, day_of_week):
    features = [hour_of_day, secrets_per_session, user_role_encoded, ip_hash, action_type_encoded, day_of_week]
    df = pd.DataFrame([features], columns=FEATURE_COLUMNS)

    score = float(model.decision_function(df)[0])
    prediction = int(model.predict(df)[0])
    is_anomaly = prediction == -1

    label = "Anomaly" if is_anomaly else "Normal"
    confidence = classify_confidence(abs(score))

    return (
        f"**{label}**",
        f"{score:.6f}",
        f"{confidence}",
    )


iface = gr.Interface(
    fn=predict,
    inputs=[
        gr.Slider(0, 23, step=1, value=10, label="Hour of Day (0-23)"),
        gr.Number(value=3, label="Secrets per Session"),
        gr.Dropdown([0, 1, 2], value=1, label="User Role (0=admin, 1=dev, 2=viewer)"),
        gr.Slider(1, 10, step=1, value=2, label="IP Hash (1-4=office, 8-10=unknown)"),
        gr.Dropdown([0, 1, 2], value=0, label="Action Type (0=read, 1=write, 2=delete)"),
        gr.Slider(0, 6, step=1, value=2, label="Day of Week (0=Mon, 6=Sun)"),
    ],
    outputs=[
        gr.Textbox(label="Prediction"),
        gr.Textbox(label="Anomaly Score"),
        gr.Textbox(label="Confidence"),
    ],
    title="EnvVault Anomaly Detector",
    description="Detects suspicious secret access patterns in audit logs using an Isolation Forest model. Enter event features to check if the access is normal or anomalous.",
)

iface.launch()
