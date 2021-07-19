import React from "react";
import { UsersPermissionsUser } from "types/strapi";

import { Document, Page } from "react-pdf";
import { Box, Heading, Text } from "@chakra-ui/react";
import { getDate } from "utils/dates";
import { useDocument } from "hooks/use-document";
interface Props {
    category?: string;
    label: string | undefined;
    authors?: UsersPermissionsUser[];
    createdAt?: string | undefined;
    isCurrent?: boolean;
    url?: string;
}

export const DocumentCard = (props: Props) => {
    let day;
    if (props.createdAt) {
        day = getDate(props.createdAt, "yyyy-MM-dd");
    }

    const { setDocument } = useDocument();
    if (props.isCurrent && props.url) {
        return (
            <Box
                as="article"
                mx={2}
                my={2}
                position="relative"
                onClick={() => setDocument({ href: props.url })}
                cursor="pointer"
            >
                <Box
                    w="full"
                    p={4}
                    h="125px"
                    bgGradient="linear(to-b, white 0%,white 50%, rgba(255,255,255,.5) 70%,  rgba(255,255,255,0))"
                    position="absolute"
                    zIndex={1}
                >
                    <Heading as="h2" size="md">
                        {props.label}
                    </Heading>
                    <Text>{day}</Text>
                </Box>
                <Box overflow="hidden">
                    <Document file={props.url} renderMode="svg">
                        <Page
                            pageNumber={1}
                            renderTextLayer={false}
                            height={250}
                        />
                    </Document>
                </Box>
            </Box>
        );
    }
    return <></>;
};