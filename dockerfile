# Base Python image
FROM python:3.11-slim

# Install build tools and system dependencies required for dlib
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    libboost-all-dev \
    libopenblas-dev \
    liblapack-dev \
    libx11-dev \
    libgtk-3-dev \
    git \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Set the working directory inside the container
WORKDIR /app

# Copy all files from your project into the container
COPY . .

# Upgrade pip
RUN pip install --upgrade pip

# 🔥 Install Python packages listed in requirements.txt
RUN pip install -r requirements.txt

# 🏃 Default command to run your app (update to match your actual entry point)
CMD ["python", "main.py"]
