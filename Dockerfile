FROM node:20

# گٹ انسٹال کرنے کے لیے یہ لائنیں ڈالنا ضروری ہیں
RUN apt-get update && apt-get install -y git

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 8000
CMD ["node", "index.js"]
