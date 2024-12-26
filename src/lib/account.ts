import axios from "axios"
import { resolve } from "path"
import { EmailMessage, SyncResponse, SyncUpdatedResponse } from "./types"
import { error } from "console"
import { db } from "@/server/db"

class Account {
    private token: string
    constructor(token: string) {
        this.token = token
    }

    private async startSync(daysWithin: number): Promise<SyncResponse> {
        const response = await axios.post<SyncResponse>('https://api.aurinko.io/v1/email/sync', {}, {
            headers: {
                Authorization: `Bearer ${this.token}`
            },
            params: {
                daysWithin,
                bodyType: 'html'
            }
        })

        return response.data
    }

    async syncEmails(){
        const account = await db.account.findUnique({
            where: {
                token: this.token
            },
        })
        if(!account) throw new Error("Invalid Token");
        if(!account.nextDeltaToken) throw new Error("No delta Token");
        let response = await this.getUpdatedEmails({deltaToken: account.nextDeltaToken})

        let allEmails: EmailMessage[] = response.records;
        let storedDeltaToken = account.nextDeltaToken
        if(response.nextDeltaToken) {
            storedDeltaToken = response.nextDeltaToken
        }

        while(response.nextPageToken){
            response = await this.getUpdatedEmails({pageToken: response.nextPageToken});
            allEmails = allEmails.concat(response.records)

            if(response.nextDeltaToken){
                storedDeltaToken = response.nextDeltaToken
            }
        }

        if(!response) throw new Error("Failed to sync emails")

            await db.account.update({
                where: {
                    id: account.id
                },
                data: {
                    nextDeltaToken: storedDeltaToken
                }
            })

    }

    async getUpdatedEmails({ deltaToken, pageToken }: { deltaToken?: string, pageToken?: string }): Promise<SyncUpdatedResponse> {
        console.log("getUpatedEmails", {pageToken, deltaToken})
        let params: Record<string, string> = {}
        if (deltaToken) {
            params.deltaToken = deltaToken
        }
        if (pageToken) {
            params.pageToken = pageToken
        }
        console.log(params)
        const response = await axios.get<SyncUpdatedResponse>('https://api.aurinko.io/v1/email/sync/updated', {
            headers: {
                Authorization: `Bearer ${this.token}`
            },
            params
        })

        return response.data
    }

    async performInitialSync() {
        try {

            // start the sync process
            const daysWithin = 2
            let syncResponse = await this.startSync(daysWithin);
            while (!syncResponse.ready) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                syncResponse = await this.startSync(daysWithin)
            }

            // get the book mark delta token
            let storedDeltaToken: string = syncResponse.syncUpdatedToken

            let updatedResponse = await this.getUpdatedEmails({ deltaToken: syncResponse.syncUpdatedToken });

            if (updatedResponse.nextDeltaToken) {
                // sync has finished
                storedDeltaToken = updatedResponse.nextDeltaToken
            }
            // all emails
            let allEmails: EmailMessage[] = updatedResponse.records;

            while (updatedResponse.nextPageToken) {
                updatedResponse = await this.getUpdatedEmails({ pageToken: updatedResponse.nextPageToken })
                allEmails = allEmails.concat(updatedResponse.records)

                if (updatedResponse.nextDeltaToken) {
                    storedDeltaToken = updatedResponse.nextDeltaToken
                }
            }

            console.log('Initial sync completed, we have synced ' + allEmails.length + ' emails')

            // store all the latest deltaToken for future syncs
            return {
                emails: allEmails,
                deltaToken: storedDeltaToken
            }

        } catch (err) {
            if (axios.isAxiosError(error)) {
                console.error('Error during sync:', JSON.stringify(error.response?.data, null, 2))
            }
            console.log("Error during sync")
        }
    }
}

export default Account