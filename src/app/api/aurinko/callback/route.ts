// exchange the code for the token

import { exchangeCodeForToken, getAccountDetails } from "@/lib/aurinko";
import { db } from "@/server/db";
import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server";

export const GET = async (req: NextRequest) => {
    const { userId } = await auth();

    if (!userId) throw new Error("Unauthorized")

    const params = req.nextUrl.searchParams;
    const status = params.get('status');
    if (status != 'success') return NextResponse.json({ message: "Failed to link account" }, { status: 401 });

    // get the code to exhange for the token
    const code = params.get('code');
    if (!code) return NextResponse.json( {message: 'No code provided' }, { status: 400 })
    
    // get the token
    const token = await exchangeCodeForToken(code as string)
    if (!token) return NextResponse.json({message: "Error exchanging code for access token"})

    // get account details
    const accountDetails = await getAccountDetails(token.accessToken);
    console.log(accountDetails);

    if(!accountDetails) return NextResponse.json({
        message: "No account details provided"
    })


    // destructure the info from the token and store it to the db
    const {accessToken, accountId} = token;

    const {email, name} = accountDetails;


    // add the Account details into the db if they do not exist
    await db.account.upsert({
        where: {
            id: accountId.toString()
        },
        update: {
            accessToken
        },
        create: {
            id: accountId.toString(),
            name,
            accountId,
            accessToken,
            email,
            userId
        }
    })

    return NextResponse.redirect(new URL('/mail', req.url))

}   