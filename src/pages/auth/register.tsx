import Button from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { registerSchema, RegisterSchema } from "./schema";
import { InputField } from "@/components/ui/input";
import { useRegister } from "./hooks";
import garageLogo from "@/assets/garage-logo.svg";

export default function RegisterPage() {
  const form = useForm<RegisterSchema>({
    resolver: zodResolver(registerSchema),
    defaultValues: { username: "", password: "", confirmPassword: "" },
  });
  const register = useRegister();

  return (
    <form
      onSubmit={form.handleSubmit((v) => register.mutate(v))}
      className="w-full max-w-md px-4"
    >
      <Card>
        <CardHeader>
          <img src={garageLogo} alt="Garage" className="mb-2 h-10 w-10" />
          <CardTitle>Create owner account</CardTitle>
          <CardDescription>
            No users exist yet. Set up the first account, which will have full
            owner access.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <InputField
            form={form}
            name="username"
            title="Username"
            placeholder="Choose a username"
          />

          <InputField
            form={form}
            name="password"
            title="Password"
            type="password"
            placeholder="Choose a password"
          />

          <InputField
            form={form}
            name="confirmPassword"
            title="Confirm Password"
            type="password"
            placeholder="Re-enter your password"
          />

          <Button
            type="submit"
            variant="default"
            className="mt-2 w-full"
            loading={register.isPending}
          >
            Create account
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
