import { db } from "@/server/db";

export const POST = async (req: Request) => {
    const { data } = await req.json();
    const { last_name: lastName, first_name: firstName, image_url: imageUrl, id } = data;
    const email = data.email_addresses[0].email_address;
    console.log(lastName);
    

    await db.user.upsert({
        where: {id},
        update: {lastName, firstName, imageUrl, email},
        create: {lastName, firstName, imageUrl, email, id}
    })

    return new Response("Webhook received", { status: 200 });
}