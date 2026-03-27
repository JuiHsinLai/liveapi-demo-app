FROM python:3.11

# Set the working directory inside the container
WORKDIR /app

# 1. Install dependencies first (for better caching)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 2. Copy the actual code and assets
# This copies everything from your local liveapi-demo-app into /app
COPY . .

ENV PROJECT_ID "cloud-llm-preview1"
ENV LOCATION "us-central1"



# 3. Cloud Run needs to run the backend
# We switch to backend so main.py can find its local imports easily
WORKDIR /app/backend

# Use the PORT environment variable provided by Cloud Run
CMD python main.py --project_id=${PROJECT_ID}