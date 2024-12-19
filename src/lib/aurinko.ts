"use server"

import { auth } from "@clerk/nextjs/server"
import axios, { Axios } from "axios"
import { error } from "console";
export const getAurinkoAuthUrl = async (serviceType: 'Google' | 'Office365') => {
    const {userId} = await auth();

    if(!userId) throw new Error("Unathorized")

    const params = new URLSearchParams({
            clientId: process.env.AURINKO_CLIENT_ID as string,
            serviceType,
            scopes: 'Mail.All Mail.Send Mail.Read Mail.ReadWrite Mail.Drafts',
            responseType: 'code',
            returnUrl: `${process.env.NEXT_PUBLIC_URL}/api/aurinko/callback`
        })

        return `https://api.aurinko.io/v1/auth/authorize?${params.toString()}`
}

// exchange the code for the token

export const exchangeCodeForToken = async (code: string) => {
    try{
        const response = await axios.post(`https://api.aurinko.io/v1/auth/token${code}`, {}, {
            auth: {
                username: process.env.AURINKO_CLIENT_ID  as string,
                password: process.env.AURINKO_CLIENT_SECRET as string
            }
        })

        return response.data as {
            accountId: number,
            accessToken: string,
            userId: string,
            userSession: string
        }
    } catch(err){
        if (axios.isAxiosError(error)){
            console.error(error.response?.data)
        }
        console.error("Error exchanging the code for the tokem")
    }
}

// exchange the token for the userAccount details

export const getAccountDetails = async (accessToken: string) => {
    try{
        const response = await axios.get("https://api.aurinko.io/v1/account", {
            headers: {
                'Authorization': `Bearer${accessToken}`
            }
        })

        return response.data as {
            email: string,
            name: string
        }
    } catch(err) {
        if(axios.isAxiosError(error)){
            console.error('Error fetching account details', error.response?.data)
        }
        console.error('Unexpected error fetching account details')
    }
}