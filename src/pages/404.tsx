import { Box, Flex, Text } from "@chakra-ui/react";
import React from "react";

const Page404 = () => {
    return (
        <Flex justify="center" align="center">
            <Box w="320px">
                <Text textAlign="center">Den här sidan finns inte ännu.</Text>
                <Text>Dessa är tillgängliga:</Text>
                <ul>
                    <li>/chapter/document,</li>
                    <li>/feed,</li>
                    <li>/feed/event,</li>
                    <li>/feed/job,</li>
                    <li>/event/[slug],</li>
                    <li>/ticket/[id]</li>
                </ul>
            </Box>
        </Flex>
    );
};

export default Page404;
