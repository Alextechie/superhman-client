// exchange the code for the token

import { exchangeCodeForToken, getAccountDetails } from "@/lib/aurinko";
import { db } from "@/server/db";
import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions"
import axios from "axios";

export const GET = async (req: NextRequest) => {
    const { userId } = await auth();

    if (!userId) throw new Error("Unauthorized")

    const params = req.nextUrl.searchParams
    const status = params.get('status');
    if (status != 'success') return NextResponse.json({ message: "Failed to link account" }, { status: 401 });

    // get the code to exhange for the token
    const code = params.get('code');
    if (!code) return NextResponse.json({ message: 'No code provided' }, { status: 400 })

    // get the token
    const token = await exchangeCodeForToken(code as string)
    if (!token) return NextResponse.json({ message: "Error exchanging code for access token" })

    // get account details
    const accountDetails = await getAccountDetails(token.accessToken);
    // console.log(accountDetails);

    if (!accountDetails) return NextResponse.json({
        message: "No account details provided"
    })


    // destructure the info from the token and store it to the db
    const { email, name } = accountDetails;


    // add the Account details into the db if they do not exist
    await db.account.upsert({
        where: {
            id: token.accountId.toString()
        },
        create: {
            id: token.accountId.toString(),
            name,
            accountId: token.accountId,
            token: token.accessToken,
            email,
            userId,
        },
        update: {
            token: token.accessToken
        },
    })

    const url = `${process.env.NEXT_PUBLIC_URL}/api/initial-sync`;
    console.log(url)
    waitUntil(
        axios.post(url, {
            accountId: token.accountId.toString(),
            userId
        }).then((res) => {
            console.log(res.data)
            console.log("Initial Email sync started")
        }).catch((err) => {
            console.log("Error triggering initial email sync:", err)
        })
    )

    return NextResponse.redirect(new URL('/mail', req.url))

}   