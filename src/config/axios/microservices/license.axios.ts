import axios, { AxiosInstance } from 'axios';

export class AxiosLicenseService {
    private axiosInstance: AxiosInstance;

    constructor() {
        this.axiosInstance = axios.create({
            baseURL: process.env.KODUS_SERVICE_AZURE_REPOS,
            headers: {
                'Content-Type': 'application/json',
            },
        });
    }

    // Methods for encapsulating axios calls
    public async get(url: string, config = {}) {
        try {
            const { data } = await this.axiosInstance.get(url, config);
            return data;
        } catch (error) {
            console.log(error);
        }
    }

    public async post(url: string, body = {}, config = {}) {
        const { data } = await this.axiosInstance.post(url, body, config);
        return data;
    }
}
