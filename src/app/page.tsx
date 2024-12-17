import { Button } from "@/components/ui/button";

export default async function Home(){
  return (
    <>
        <div className="text-blue-600 p-4">Welcome to the homepage</div>
        <Button className="px-4 bg-gray-400 text-slate-900 ml-4 hover:bg-white">Click here</Button>
    </>
  )
};