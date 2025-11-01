FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY . .
RUN chmod +x start.sh

EXPOSE 8080
CMD ["./start.sh"]














# FROM python:3.11-slim

# # Set environment variables
# ENV PYTHONUNBUFFERED=1
# ENV PYTHONDONTWRITEBYTECODE=1

# WORKDIR /app

# # Install system dependencies
# RUN apt-get update && apt-get upgrade -y \
#     && apt-get install -y --no-install-recommends \
#         build-essential \
#         curl \
#     && rm -rf /var/lib/apt/lists/* \
#     && apt-get clean

# # Copy requirements first for better caching
# COPY requirements.txt .

# # Install Python dependencies
# RUN pip install --no-cache-dir --upgrade pip \
#     && pip install --no-cache-dir -r requirements.txt

# # Copy application code
# COPY . .

# # Make start.sh executable
# RUN chmod +x start.sh

# # Expose the port
# EXPOSE 8080

# # Use your start.sh script
# CMD ["./start.sh"]



















# FROM python:3.11-slim

# # Set environment variables
# ENV PYTHONUNBUFFERED=1
# ENV PYTHONDONTWRITEBYTECODE=1
# # REMOVE THIS LINE: ENV PORT=8080

# WORKDIR /app

# # Install system dependencies
# RUN apt-get update && apt-get upgrade -y \
#     && apt-get install -y --no-install-recommends \
#         build-essential \
#         libpq-dev \
#         curl \
#         gettext \
#     && rm -rf /var/lib/apt/lists/* \
#     && apt-get clean

# # Copy requirements first for better caching
# COPY requirements.txt .

# # Install Python dependencies
# RUN pip install --no-cache-dir --upgrade pip \
#     && pip install --no-cache-dir -r requirements.txt

# # Copy application code
# COPY . .

# # Verify required packages are installed
# RUN python -c "import django; print(f'Django {django.__version__}')" && \
#     python -c "import daphne; print('Daphne installed')" && \
#     python -c "import celery; print('Celery installed')"

# # Expose the port
# EXPOSE 8080

# # Use your actual start.sh script
# CMD ["./start.sh"]