FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

RUN apt-get update && apt-get upgrade -y \
    && apt-get install -y build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN python manage.py collectstatic --noinput

ENV PORT=8080

CMD ["sh", "-c", "python manage.py migrate && gunicorn neuraplay.wsgi:application --bind 0.0.0.0:$PORT --workers 2"]
















