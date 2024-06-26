import { Field, ObjectType } from "@nestjs/graphql"
import { IsJWT } from "class-validator"
import { AccountRoleMySqlEntity } from "@database"

@ObjectType()
export class AuthTokens {
  @IsJWT()
  @Field(() => String)
      accessToken: string
  @IsJWT()
  @Field(() => String)
      refreshToken: string
}

export enum TokenType {
  Access = "Access",
  Refresh = "Refresh",
  Verify = "Verify",
}

export enum AuthTokenType {
  Access = "Access",
  Refresh = "Refresh",
}

export type Payload = {
  accountId: string;
  accountRoles?: Array<string>;
  type: AuthTokenType;
  iat: string;
  exp: string;
};
